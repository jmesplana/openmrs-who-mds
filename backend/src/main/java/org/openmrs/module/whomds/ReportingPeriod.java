package org.openmrs.module.whomds;

import java.time.*;
import java.util.*;

/** Local wall times are resolved strictly: a DST gap or overlap requires an explicit offset. */
public final class ReportingPeriod {
    public final Instant start, end;
    public final ZoneId zone;
    public final String frequency;

    public ReportingPeriod(String start, String end, String timezone, String frequency) {
        this.zone = ZoneId.of(timezone);
        this.start = resolve(start, zone);
        this.end = resolve(end, zone);
        if (!this.end.isAfter(this.start)) throw new IllegalArgumentException("End must be after start.");
        if (Duration.between(this.start, this.end).compareTo(Duration.ofDays(93)) > 0)
            throw new IllegalArgumentException("Choose a period of at most 93 days.");
        if (!Arrays.asList("daily", "weekly").contains(frequency))
            throw new IllegalArgumentException("Frequency must be daily or weekly.");
        this.frequency = frequency;
    }

    static Instant resolve(String value, ZoneId zone) {
        try {
            OffsetDateTime offset = OffsetDateTime.parse(value);
            if (!zone.getRules().getValidOffsets(offset.toLocalDateTime()).contains(offset.getOffset()))
                throw new IllegalArgumentException("Offset does not match the selected timezone.");
            return offset.toInstant();
        } catch (java.time.format.DateTimeParseException ignored) {
            LocalDateTime local = LocalDateTime.parse(value);
            List<ZoneOffset> offsets = zone.getRules().getValidOffsets(local);
            if (offsets.size() != 1)
                throw new IllegalArgumentException("This local time is ambiguous or nonexistent due to daylight saving. Enter an ISO date/time with a valid offset.");
            return local.toInstant(offsets.get(0));
        }
    }

    public List<Instant[]> buckets() {
        List<Instant[]> result = new ArrayList<>();
        Instant cursor = start;
        // Preserve the chosen local reporting cutoff, including across DST changes.
        LocalDateTime anchor = start.atZone(zone).toLocalDateTime();
        int days = frequency.equals("weekly") ? 7 : 1;
        for (int index = 1; cursor.isBefore(end); index++) {
            LocalDateTime nextLocal = anchor.plusDays((long) days * index);
            List<ZoneOffset> offsets = zone.getRules().getValidOffsets(nextLocal);
            if (offsets.size() != 1)
                throw new IllegalArgumentException("A reporting cutoff crosses a DST gap or overlap. Choose a cutoff outside the transition hour.");
            Instant next = nextLocal.toInstant(offsets.get(0));
            if (next.isAfter(end)) next = end;
            result.add(new Instant[] {cursor, next});
            cursor = next;
        }
        return result;
    }
}
