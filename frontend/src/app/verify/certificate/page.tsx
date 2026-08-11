"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Award, Search, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function CertificateSearchPage() {
  const router = useRouter()
  const [certificateNumber, setCertificateNumber] = useState("")

  function verifyCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const number = certificateNumber.trim()
    if (number) router.push(`/verify/certificate/${encodeURIComponent(number)}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <Card className="w-full max-w-xl border-cyan-100 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <ShieldCheck className="size-7" />
          </div>
          <CardTitle className="mt-4 text-2xl">Certificate verification</CardTitle>
          <CardDescription>
            Enter the certificate number, or scan the QR code printed on the certificate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={verifyCertificate}>
            <label className="block space-y-2 text-sm font-medium">
              Certificate ID
              <Input
                autoComplete="off"
                autoFocus
                onChange={(event) => setCertificateNumber(event.target.value)}
                placeholder="e.g. VTS-20260811-3862734F"
                value={certificateNumber}
              />
            </label>
            <Button className="w-full" disabled={!certificateNumber.trim()} type="submit">
              <Search className="size-4" /> Verify certificate
            </Button>
          </form>
          <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Award className="size-4 text-cyan-700" /> Public verification - no account required
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
