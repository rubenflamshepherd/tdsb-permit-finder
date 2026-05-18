import { syncBookings } from "../lib/sync";

const start = process.env.START_DATE;
const end = process.env.END_DATE;
console.log(await syncBookings(start, end));
