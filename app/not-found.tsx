"use client";

import Link from "next/link";
import { ErrorNotice, PRIMARY_ACTION } from "@/components/ErrorNotice";
import { useMessages } from "@/lib/i18n/locale";

export default function NotFound() {
  const t = useMessages();
  return (
    <ErrorNotice title={t.errorPage.notFoundTitle} body={t.errorPage.notFoundBody}>
      <Link href="/" className={PRIMARY_ACTION}>
        {t.header.home}
      </Link>
    </ErrorNotice>
  );
}
