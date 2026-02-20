import { PersonaProfile, PersonaStore } from "./PersonaStore";

export class InMemoryPersonaStore implements PersonaStore {
  private personas: PersonaProfile[] = [];

  async listPersonas(): Promise<PersonaProfile[]> {
    return [...this.personas];
  }

  async getPersona(id: string): Promise<PersonaProfile | null> {
    return this.personas.find((persona) => persona.id === id) ?? null;
  }

  async upsertPersona(input: Omit<PersonaProfile, "createdAt" | "updatedAt">): Promise<PersonaProfile> {
    const now = Date.now();
    const existingIndex = this.personas.findIndex((persona) => persona.id === input.id);
    if (existingIndex >= 0) {
      const updated: PersonaProfile = {
        ...this.personas[existingIndex],
        ...input,
        updatedAt: now,
      };
      this.personas[existingIndex] = updated;
      return updated;
    }
    const created: PersonaProfile = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.personas.push(created);
    return created;
  }
}
