import { syncInventory } from "../lib/sync";

const permitTypeId = Number(process.env.PERMIT_TYPE_ID ?? 3);
console.log(await syncInventory(permitTypeId));
