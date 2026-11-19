package org.openmrs.module.whomds;

import com.fasterxml.jackson.databind.*;
import org.openmrs.*;
import org.openmrs.api.context.Context;
import javax.servlet.http.*;
import java.io.*;
import java.time.*;
import java.util.*;

/** Runs inside the authenticated OpenMRS request; never uses an administrator service account. */
public class ReportServlet extends HttpServlet {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String RUN = "Run WHO MDS Reports";

    static Map<String, Object> map(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) out.put((String)pairs[i], pairs[i + 1]);
        return out;
    }

    private boolean allowed(Location location) {
        return Context.hasPrivilege("WHO MDS All Locations") || Context.hasPrivilege("WHO MDS Location: " + location.getUuid());
    }

    @Override public void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (!Context.isAuthenticated()) { error(response, 401, "Sign in to OpenMRS to run reports."); return; }
        if (!Context.hasPrivilege(RUN)) { error(response, 403, "Run WHO MDS Reports privilege is required."); return; }
        try {
            if ("locations".equals(request.getParameter("action"))) {
                List<Object> locations = new ArrayList<>();
                for (Location location : Context.getLocationService().getAllLocations(false))
                    if (allowed(location)) locations.add(map("uuid", location.getUuid(), "display", location.getName()));
                JSON.writeValue(response.getWriter(), map("results", locations));
                return;
            }
            Location location = Context.getLocationService().getLocationByUuid(required(request, "location"));
            if (location == null || location.getRetired() || !allowed(location)) {
                error(response, 403, "This location is unavailable or you do not have permission to report on it."); return;
            }
            ReportingPeriod period = new ReportingPeriod(required(request, "start"), required(request, "end"),
                    required(request, "timezone"), required(request, "frequency"));
            List<Instant[]> buckets = period.buckets(); // Validate all cutoffs before querying data.
            JsonNode mappings;
            try {
                mappings = JSON.readTree(Context.getAdministrationService().getGlobalProperty("whomds.mappings", "{}"));
                if (mappings == null || !mappings.isObject()) throw new IllegalArgumentException();
            } catch (Exception e) {
                error(response, 503, "The whomds.mappings global property is invalid. Ask an administrator to review it."); return;
            }
            JsonNode catalog = JSON.readTree(getClass().getResourceAsStream("/indicators.json"));
            List<Aggregator.Event> events = new ArrayList<>();
            Map<String, String> statuses = new LinkedHashMap<>();
            for (JsonNode indicator : catalog) {
                String id = indicator.get("id").asText();
                JsonNode mapping = mappings.get(id);
                if (indicator.path("manual").asBoolean()) { statuses.put(id, "Manual entry required"); continue; }
                if (mapping == null) { statuses.put(id, "Not configured"); continue; }
                // Validate each mapping before collecting; invalid mappings never masquerade as zero.
                String validation = validate(mapping);
                if (validation != null) { statuses.put(id, validation); continue; }
                collect(events, id, mapping, location, period);
                statuses.put(id, "Mapped — review required");
            }
            List<Object> reports = new ArrayList<>();
            for (Instant[] bucket : buckets) {
                List<Object> rows = new ArrayList<>();
                for (JsonNode indicator : catalog) {
                    String id = indicator.get("id").asText();
                    boolean mapped = statuses.get(id).startsWith("Mapped");
                    rows.add(map("id", id, "label", indicator.get("label").asText(), "section", indicator.get("section").asText(),
                            "bands", indicator.path("bands").asText("total"), "status", statuses.get(id),
                            "counts", mapped ? Aggregator.count(events, id, bucket[0], bucket[1], period.zone,
                                    "demographic".equals(indicator.path("bands").asText())) : null));
                }
                reports.add(map("start", bucket[0].toString(), "end", bucket[1].toString(), "rows", rows));
            }
            JSON.writeValue(response.getWriter(), map("status", "DRAFT", "specification", "EMT MDS Daily Reporting Form, Ver 2019 WHO",
                    "location", map("uuid", location.getUuid(), "display", location.getName()),
                    "timezone", period.zone.getId(), "frequency", period.frequency, "generatedAt", Instant.now().toString(),
                    "start", period.start.toString(), "end", period.end.toString(), "reports", reports,
                    "warnings", Arrays.asList("Draft: verify mappings, missing data and team details before use.",
                        "End times are exclusive. Only the exact selected location is included; child locations are excluded.",
                        "Counts reflect configured encounter/observation events, not automatically unique patients.",
                        "Missing observations cannot be distinguished from unrecorded clinical activity. A mapped zero does not establish completeness.",
                        "Weekly output is a period summary, not the official daily submission. Bed snapshots and narrative sections require manual completion.")));
        } catch (IllegalArgumentException | DateTimeException e) {
            error(response, 400, e.getMessage() == null ? "Invalid report parameters." : e.getMessage());
        } catch (org.openmrs.api.APIAuthenticationException e) {
            error(response, 403, "Your OpenMRS role lacks a required clinical read privilege.");
        } catch (Exception e) {
            // Do not expose patient data or database details in errors or logs.
            error(response, 500, "Report generation failed. Ask an administrator to verify module configuration and compatibility.");
        }
    }

    private String validate(JsonNode m) {
        if (!m.isObject() || !m.path("reviewed").asBoolean()) return "Mapping not reviewed";
        String source = m.path("source").asText();
        if ("encounter".equals(source)) {
            if (!m.path("encounterTypes").isArray() || m.get("encounterTypes").size() == 0) return "Invalid encounter mapping";
            for (JsonNode uuid : m.get("encounterTypes")) {
                EncounterType type = Context.getEncounterService().getEncounterTypeByUuid(uuid.asText());
                if (type == null || type.getRetired()) return "Unknown or retired encounter type";
            }
        } else if ("codedObservation".equals(source)) {
            Concept question = Context.getConceptService().getConceptByUuid(m.path("question").asText());
            if (question == null || question.getRetired() || !question.getDatatype().isCoded()) return "Unknown, retired or non-coded question";
            if (!m.path("answers").isArray() || m.get("answers").size() == 0) return "No coded answers configured";
            for (JsonNode uuid : m.get("answers")) {
                Concept answer = Context.getConceptService().getConceptByUuid(uuid.asText());
                if (answer == null || answer.getRetired()) return "Unknown or retired answer concept";
            }
            if (!Arrays.asList("encounter", "observation").contains(m.path("countUnit").asText())) return "Invalid count unit";
        } else return "Unsupported mapping source";
        return null;
    }

    private void collect(List<Aggregator.Event> out, String id, JsonNode m, Location location, ReportingPeriod period) {
        Date start = Date.from(period.start), end = Date.from(period.end);
        if ("encounter".equals(m.get("source").asText())) {
            List<EncounterType> types = new ArrayList<>();
            for (JsonNode uuid : m.get("encounterTypes")) types.add(Context.getEncounterService().getEncounterTypeByUuid(uuid.asText()));
            List<Encounter> encounters = Context.getEncounterService().getEncounters(null, location, start, end, null, types, null, null, null, false);
            for (Encounter e : encounters) {
                if (Boolean.TRUE.equals(e.getVoided()) || e.getPatient().getVoided() || e.getLocation() == null || !location.equals(e.getLocation())) continue;
                out.add(new Aggregator.Event(id, e.getUuid(), e.getEncounterDatetime().toInstant(), birthDate(e.getPatient())));
            }
        } else {
            Concept question = Context.getConceptService().getConceptByUuid(m.get("question").asText());
            Set<String> answers = new HashSet<>();
            for (JsonNode uuid : m.get("answers")) answers.add(uuid.asText());
            List<Obs> observations = Context.getObsService().getObservations(null, null, Collections.singletonList(question),
                    null, null, Collections.singletonList(location), null, null, null, start, end, false);
            for (Obs obs : observations) {
                Encounter e = obs.getEncounter();
                if (obs.getVoided() || obs.getPerson() == null || obs.getPerson().getPersonVoided() || obs.getObsDatetime() == null
                        || obs.getValueCoded() == null || !answers.contains(obs.getValueCoded().getUuid())
                        || obs.getLocation() == null || !location.equals(obs.getLocation())
                        || (e != null && (e.getVoided() || e.getLocation() == null || !location.equals(e.getLocation())))) continue;
                boolean byEncounter = "encounter".equals(m.get("countUnit").asText());
                if (byEncounter && e == null) continue;
                out.add(new Aggregator.Event(id, byEncounter ? e.getUuid() : obs.getUuid(), obs.getObsDatetime().toInstant(), birthDate(obs.getPerson())));
            }
        }
        if (out.size() > 100000) throw new IllegalArgumentException("Too many source events. Select a shorter reporting period.");
    }

    private LocalDate birthDate(Person person) {
        // OpenMRS birthdate is a date-only field; preserve its stored calendar date, not the reporting timezone.
        if (person.getBirthdate() == null) return null;
        java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM-dd");
        return LocalDate.parse(format.format(person.getBirthdate()));
    }

    private static String required(HttpServletRequest request, String name) {
        String value = request.getParameter(name);
        if (value == null || value.trim().isEmpty() || value.length() > 100) throw new IllegalArgumentException("Missing or invalid " + name + ".");
        return value;
    }
    private static void error(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status); JSON.writeValue(response.getWriter(), map("error", message));
    }
}
