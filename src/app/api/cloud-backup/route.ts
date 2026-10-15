import { connection } from "next/server";
import { cloudRead, cloudWrite } from "@/lib/cloud-backup.server";

export async function GET(request: Request) {
  await connection();
  return cloudRead(request);
}
export const POST = cloudWrite;
