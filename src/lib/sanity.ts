import { createClient } from "@sanity/client";

export const sanity = createClient({
  projectId: "903wnv01",
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: true,
});
