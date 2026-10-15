"use client";

import CloudBackup from "./cloud-backup";
import { useFavorites } from "@/lib/favorites-store";
import { useStudyHistory } from "@/lib/study-store";

export default function BackupControls() {
  const favorites = useFavorites(), study = useStudyHistory();
  const disabled = !favorites.ready || !study.ready || Boolean(favorites.error || study.error);
  return <CloudBackup disabled={disabled} />;
}
