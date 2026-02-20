import { promises as fs } from "node:fs";
import path from "node:path";
import { PersonaProfile, PersonaStore } from "./PersonaStore";

export class FilePersonaStore implements PersonaStore {
  constructor(private filePath: string = path.resolve(process.cwd(), "data", "personas.json")) {}

  async listPersonas(): Promise<PersonaProfile[]> {
    return this.readAll();
  }

  async getPersona(id: string): Promise<PersonaProfile | null> {
    const personas = await this.readAll();
    return personas.find((persona) => persona.id === id) ?? null;
  }

  async upsertPersona(input: Omit<PersonaProfile, "createdAt" | "updatedAt">): Promise<PersonaProfile> {
    const personas = await this.readAll();
    const now = Date.now();
    const existingIndex = personas.findIndex((persona) => persona.id === input.id);
    if (existingIndex >= 0) {
      const updated: PersonaProfile = {
        ...personas[existingIndex],
        ...input,
        updatedAt: now,
      };
      personas[existingIndex] = updated;
      await this.writeAll(personas);
      return updated;
    }
    const created: PersonaProfile = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    personas.push(created);
    await this.writeAll(personas);
    return created;
  }

  private async readAll(): Promise<PersonaProfile[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as PersonaProfile[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: PersonaProfile[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}
