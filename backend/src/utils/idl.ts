import type * as anchor from "@coral-xyz/anchor";

type IdlTypeDef = any;

type IdlWithAccounts = anchor.Idl & {
  accounts?: Array<{ name: string; type?: IdlTypeDef }>;
  types?: Array<{ name: string; type: IdlTypeDef }>;
};

export function hydrateIdlAccounts(idl: anchor.Idl): anchor.Idl {
  const withAccounts = idl as IdlWithAccounts;
  if (!withAccounts.accounts || !withAccounts.types) {
    return idl;
  }

  const typeMap = new Map(withAccounts.types.map((t) => [t.name, t.type]));
  const accounts = withAccounts.accounts.map((account) => {
    const accountAny = account as any;
    if (accountAny.type) {
      return accountAny;
    }
    const type = typeMap.get(account.name);
    if (!type) {
      return accountAny;
    }
    return { ...accountAny, type };
  });

  return { ...withAccounts, accounts } as anchor.Idl;
}
