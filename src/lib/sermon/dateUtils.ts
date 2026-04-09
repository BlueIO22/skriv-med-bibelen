export const formatLong = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export const formatShort = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
  });

export const todayISO = () => new Date().toISOString().slice(0, 10);
