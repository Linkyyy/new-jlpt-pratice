import { connection } from "next/server";
import { cloudAuth, cloudStatus } from "@/lib/cloud-backup.server";

export async function GET(request: Request) {
  await connection();
  return cloudStatus(request);
}
export const POST = cloudAuth;
