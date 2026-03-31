/**
 * Updates the `dato` field in the `church_year_day` Supabase table for a given tekstrekke and year.
 *
 * Usage:
 *   npx tsx scripts/update-church-year-dates.ts --year 2027
 *   npx tsx scripts/update-church-year-dates.ts --year 2027 --tekstrekke 2  (override if needed)
 *
 * The script shifts all dates from the reference church year (in the JSON file)
 * to the target year by calculating the offset between the two Advent Sundays.
 *
 * The --year parameter is the MAIN calendar year the church year falls in:
 *   Church year 2027 starts on Advent Sunday 2026 (Nov 29) and runs through 2027.
 *   So pass --year 2027 and the script uses getAdventSunday(2026) internally.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Returns the 1st Sunday of Advent for a given year.
 * Advent Sunday = the Sunday nearest to November 30 (falls between Nov 27–Dec 3).
 */
function getAdventSunday(year: number): Date {
  const nov30 = new Date(year, 10, 30); // month is 0-indexed
  const dayOfWeek = nov30.getDay(); // 0 = Sunday

  const prevSunday = new Date(nov30);
  prevSunday.setDate(nov30.getDate() - dayOfWeek);

  const nextSunday = new Date(prevSunday);
  nextSunday.setDate(prevSunday.getDate() + 7);

  const diffPrev = Math.abs(nov30.getTime() - prevSunday.getTime());
  const diffNext = Math.abs(nextSunday.getTime() - nov30.getTime());

  return diffPrev <= diffNext ? prevSunday : nextSunday;
}

/** Parse "YYYY-MM-DD" as local midnight (avoids UTC-offset shifts). */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Format Date as "YYYY-MM-DD" using local time components. */
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
  };

  const tekstrekkeStr = getArg("--tekstrekke");
  const yearStr = getArg("--year");

  if (!yearStr) {
    console.error("Usage: npx tsx scripts/update-church-year-dates.ts --year <YYYY> [--tekstrekke <1|2|3>]");
    process.exit(1);
  }

  const targetYear = parseInt(yearStr, 10);

  // Cycle: 2024→2, 2025→3, 2026→1, 2027→2, 2028→3, 2029→1, ...
  const CYCLE: Record<number, number> = { 0: 2, 1: 3, 2: 1 };
  const derivedTekstrekke = CYCLE[((targetYear - 2024) % 3 + 3) % 3];

  const tekstrekke = tekstrekkeStr ? parseInt(tekstrekkeStr, 10) : derivedTekstrekke;

  if (![1, 2, 3].includes(tekstrekke)) {
    console.error("--tekstrekke must be 1, 2, or 3");
    process.exit(1);
  }

  if (!tekstrekkeStr) {
    console.log(`Derived tekstrekke: ${tekstrekke} (from year ${targetYear})`);
  }

  // Load reference data from JSON
  const jsonPath = path.resolve(__dirname, `../church_year_tekstrekke_${tekstrekke}.json`);
  const entries: Array<{ name: string; dato: string; tekstrekke: number }> = JSON.parse(
    fs.readFileSync(jsonPath, "utf-8")
  );

  // Find the reference Advent Sunday (date for "1sonadv" in the JSON)
  const refEntry = entries.find((e) => e.name === "1sonadv");
  if (!refEntry) {
    console.error("Could not find '1sonadv' entry in JSON to determine reference Advent Sunday");
    process.exit(1);
  }

  const refAdventSunday = parseLocalDate(refEntry.dato);
  // Church year N starts on Advent Sunday of year N-1 (e.g. church year 2027 → Advent 2026)
  const targetAdventSunday = getAdventSunday(targetYear - 1);
  const dayOffset =
    Math.round((targetAdventSunday.getTime() - refAdventSunday.getTime()) / (1000 * 60 * 60 * 24));

  console.log(`Tekstrekke ${tekstrekke}`);
  console.log(`Reference Advent Sunday: ${toISODate(refAdventSunday)}`);
  console.log(`Target Advent Sunday:    ${toISODate(targetAdventSunday)}`);
  console.log(`Day offset:              ${dayOffset > 0 ? "+" : ""}${dayOffset}`);
  console.log();

  // Build unique name → new date mapping (skip duplicates with same name)
  const seen = new Set<string>();
  const updates: Array<{ name: string; newDate: string }> = [];

  for (const entry of entries) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);

    if (!entry.dato) continue; // skip entries without a reference date

    const refDate = parseLocalDate(entry.dato);
    const newDate = addDays(refDate, dayOffset);
    updates.push({ name: entry.name, newDate: toISODate(newDate) });
  }

  console.log(`Updating ${updates.length} unique church days for tekstrekke ${tekstrekke}...`);

  let successCount = 0;
  let errorCount = 0;

  for (const { name, newDate } of updates) {
    const { error } = await supabase
      .from("church_year_day")
      .update({ dato: newDate })
      .eq("name", name)
      .eq("tekstrekke", tekstrekke);

    if (error) {
      console.error(`  ✗ ${name}: ${error.message}`);
      errorCount++;
    } else {
      console.log(`  ✓ ${name} → ${newDate}`);
      successCount++;
    }
  }

  console.log();
  console.log(`Done. ${successCount} updated, ${errorCount} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
