package org.openmrs.module.whomds;

import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class ReportingTest {
    @Test void springDayIs23Hours() {
        ReportingPeriod p = new ReportingPeriod("2026-03-29T00:00", "2026-03-30T00:00", "Europe/Zurich", "daily");
        assertEquals(23, Duration.between(p.start, p.end).toHours());
        assertEquals(1, p.buckets().size());
    }
    @Test void autumnDayIs25Hours() {
        ReportingPeriod p = new ReportingPeriod("2026-10-25T00:00", "2026-10-26T00:00", "Europe/Zurich", "daily");
        assertEquals(25, Duration.between(p.start, p.end).toHours());
    }
    @Test void rejectsAmbiguousAndNonexistentLocalTimes() {
        assertThrows(IllegalArgumentException.class, () -> ReportingPeriod.resolve("2026-10-25T02:30", ZoneId.of("Europe/Zurich")));
        assertThrows(IllegalArgumentException.class, () -> ReportingPeriod.resolve("2026-03-29T02:30", ZoneId.of("Europe/Zurich")));
        assertEquals(Instant.parse("2026-10-25T01:30:00Z"), ReportingPeriod.resolve("2026-10-25T02:30+01:00", ZoneId.of("Europe/Zurich")));
        assertThrows(IllegalArgumentException.class, () -> ReportingPeriod.resolve("2026-10-25T02:30+04:00", ZoneId.of("Europe/Zurich")));
    }
    @Test void weeklyBucketsPreserveCutoffAndClipLastInterval() {
        ReportingPeriod p = new ReportingPeriod("2026-03-26T06:00", "2026-04-04T09:00", "Europe/Zurich", "weekly");
        assertEquals(2, p.buckets().size());
        assertEquals(Instant.parse("2026-04-02T04:00:00Z"), p.buckets().get(0)[1]);
        assertEquals(p.end, p.buckets().get(1)[1]);
    }
    @Test void rejectsReverseAndOversizedRanges() {
        assertThrows(IllegalArgumentException.class, () -> new ReportingPeriod("2026-01-02T00:00", "2026-01-01T00:00", "UTC", "daily"));
        assertThrows(IllegalArgumentException.class, () -> new ReportingPeriod("2026-01-01T00:00", "2027-01-01T00:00", "UTC", "daily"));
    }
    @Test void rejectsIntermediateDstCutoff() {
        ReportingPeriod p = new ReportingPeriod("2026-03-28T02:30", "2026-03-30T02:30", "Europe/Zurich", "daily");
        assertThrows(IllegalArgumentException.class, p::buckets);
    }
    @Test void usesHalfOpenIntervalAndDeduplicatesWithinIndicator() {
        Instant start = Instant.parse("2026-01-01T00:00:00Z"), end = start.plusSeconds(86400);
        List<Aggregator.Event> events = Arrays.asList(
            new Aggregator.Event("9", "a", start, LocalDate.of(2022, 1, 1)),
            new Aggregator.Event("9", "a", start.plusSeconds(60), LocalDate.of(2022, 1, 1)),
            new Aggregator.Event("9", "b", end, null),
            new Aggregator.Event("10", "c", start, null),
            new Aggregator.Event("9", "d", start.minusSeconds(1), null));
        Map<String, Long> count = Aggregator.count(events, "9", start, end, ZoneId.of("UTC"), false);
        assertEquals(1L, count.get("Total")); assertEquals(1L, count.get("<5"));
    }
    @Test void diagnosisGroupCountsEachEncounterOnce() {
        // An encounterDiagnosis mapping keys events by encounter, so several matching diagnoses
        // on one encounter (e.g. two vertebral fractures under MDS 4) must count once.
        Instant start = Instant.parse("2026-01-01T00:00:00Z"), end = start.plusSeconds(86400);
        List<Aggregator.Event> events = Arrays.asList(
            new Aggregator.Event("4", "enc-1", start, LocalDate.of(1990, 5, 2)),
            new Aggregator.Event("4", "enc-1", start.plusSeconds(120), LocalDate.of(1990, 5, 2)),
            new Aggregator.Event("4", "enc-2", start.plusSeconds(240), LocalDate.of(2024, 1, 1)));
        Map<String, Long> count = Aggregator.count(events, "4", start, end, ZoneId.of("UTC"), false);
        assertEquals(2L, count.get("Total"));
        assertEquals(1L, count.get("5+"));
        assertEquals(1L, count.get("<5"));
    }
    @Test void handlesUnknownAgeAndBirthdayInReportingTimezone() {
        Instant start = Instant.parse("2026-01-01T23:00:00Z"), end = start.plusSeconds(3600);
        List<Aggregator.Event> events = Arrays.asList(
            new Aggregator.Event("1", "a", start, LocalDate.of(2021, 1, 2)),
            new Aggregator.Event("1", "b", start, null),
            new Aggregator.Event("1", "c", start, LocalDate.of(2030, 1, 1)));
        Map<String, Long> count = Aggregator.count(events, "1", start, end, ZoneId.of("Asia/Manila"), true);
        assertEquals(1L, count.get("5–17")); assertEquals(2L, count.get("Unknown age")); assertEquals(3L, count.get("Total"));
    }
}
