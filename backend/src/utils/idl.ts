import type * as anchor from "@coral-xyz/anchor";

type IdlWithAccounts = anchor.Idl & {
  accounts?: Array<{ name: string; type?: anchor.IdlTypeDefTy }>;
  types?: Array<{ name: string; type: anchor.IdlTypeDefTy }>;
};

export function hydrateIdlAccounts(idl: anchor.Idl): anchor.Idl {
  const withAccounts = idl as IdlWithAccounts;
  if (!withAccounts.accounts || !withAccounts.types) {
    return idl;
  }

  const typeMap = new Map(withAccounts.types.map((t) => [t.name, t.type]));
  const accounts = withAccounts.accounts.map((account) => {
    if (account.type) {
      return account;
    }
    const type = typeMap.get(account.name);
    if (!type) {
      return account;
    }
    return { ...account, type };
  });

  return { ...withAccounts, accounts } as anchor.Idl;
}
