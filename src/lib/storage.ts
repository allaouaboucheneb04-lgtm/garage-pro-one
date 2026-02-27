import { promises as fs } from "fs";
import path from "path";
import { Promo, Lead } from "./types";

const dataDir = path.join(process.cwd(), "src", "data");
const promosPath = path.join(dataDir, "promos.json");
const leadsPath = path.join(dataDir, "leads.json");

async function ensureLeadsFile() {
  try {
    await fs.access(leadsPath);
  } catch {
    await fs.writeFile(leadsPath, JSON.stringify([], null, 2), "utf-8");
  }
}

export async function readPromos(): Promise<Promo[]> {
  const raw = await fs.readFile(promosPath, "utf-8");
  return JSON.parse(raw) as Promo[];
}

export async function writePromos(promos: Promo[]): Promise<void> {
  await fs.writeFile(promosPath, JSON.stringify(promos, null, 2), "utf-8");
}

export async function readLeads(): Promise<Lead[]> {
  await ensureLeadsFile();
  const raw = await fs.readFile(leadsPath, "utf-8");
  return JSON.parse(raw) as Lead[];
}

export async function addLead(lead: Lead): Promise<void> {
  const leads = await readLeads();
  leads.unshift(lead);
  await fs.writeFile(leadsPath, JSON.stringify(leads, null, 2), "utf-8");
}
