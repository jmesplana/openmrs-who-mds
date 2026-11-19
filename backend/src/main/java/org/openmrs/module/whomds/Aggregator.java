package org.openmrs.module.whomds;

import java.time.*;
import java.util.*;

/** Framework-independent counting, with no patient identifiers in the output. */
public final class Aggregator {
    public static final class Event {
        public String indicator, key;
        public Instant at;
        public LocalDate birthDate;
        public Event(String indicator, String key, Instant at, LocalDate birthDate) {
            this.indicator = indicator; this.key = key; this.at = at; this.birthDate = birthDate;
        }
    }

    public static Map<String, Long> count(List<Event> events, String id, Instant start, Instant end, ZoneId zone, boolean demographic) {
        Map<String, Long> counts = new LinkedHashMap<>();
        String[] bands = demographic ? new String[]{"<1", "1–4", "5–17", "18–64", "65+", "Unknown age"}
                : new String[]{"<5", "5+", "Unknown age"};
        for (String band : bands) counts.put(band, 0L);
        counts.put("Total", 0L);
        Set<String> seen = new HashSet<>();
        // Sort first so repeated observations counted per encounter have deterministic age attribution.
        List<Event> sorted = new ArrayList<>(events);
        sorted.sort(Comparator.comparing(e -> e.at));
        for (Event event : sorted) {
            if (!id.equals(event.indicator) || event.at.isBefore(start) || !event.at.isBefore(end) || !seen.add(event.key)) continue;
            LocalDate date = event.at.atZone(zone).toLocalDate();
            int age = event.birthDate == null || event.birthDate.isAfter(date) ? -1 : Period.between(event.birthDate, date).getYears();
            String band = age < 0 ? "Unknown age" : demographic
                    ? age < 1 ? "<1" : age < 5 ? "1–4" : age < 18 ? "5–17" : age < 65 ? "18–64" : "65+"
                    : age < 5 ? "<5" : "5+";
            counts.put(band, counts.get(band) + 1);
            counts.put("Total", counts.get("Total") + 1);
        }
        return counts;
    }
}
