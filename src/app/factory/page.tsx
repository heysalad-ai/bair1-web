import Image from "next/image";
import Link from "next/link";
import FirmwareInstaller from "@/components/FirmwareInstaller";
export const metadata = { title: "Bair1 factory setup", robots: { index: false, follow: false } };
export default function FactoryPage() {
  return <main className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
    <Link href="/" className="mb-8 inline-flex items-center gap-3 text-xl font-semibold text-ink"><Image src="/bear-logo.png" alt="" width={40} height={40} />Bair1</Link>
    <FirmwareInstaller />
  </main>;
}
