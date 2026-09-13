"use client"

import Link from "next/link"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Send, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { isSmsUnavailable, SmsServiceBanner } from "@/components/marketing/SmsServiceBanner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResolvedAdminRoute } from "@/kernel/types"
import { getApiErrorMessage } from "@/lib/api-helpers"
import {
  createSmsPhonebook,
  createSmsPhonebookContact,
  fetchSmsPhonebookContacts,
  fetchSmsPhonebooks,
  smsQueryOptions,
} from "../lib/modirpayamak-api"
import { SmsPanelShell } from "../lib/sms-panel-shell"

interface Phonebook {
  id: number
  name: string
}

export default function PageClient({ route: _route }: { route: ResolvedAdminRoute }) {
  const t = useTranslations("sms")
  const qc = useQueryClient()
  const [newName, setNewName] = useState("")
  const [creatingBook, setCreatingBook] = useState(false)
  const [selectedBook, setSelectedBook] = useState<Phonebook | null>(null)
  const [contactPhone, setContactPhone] = useState("")
  const [contactName, setContactName] = useState("")
  const [addingContact, setAddingContact] = useState(false)

  const booksQ = useQuery({
    queryKey: ["sms", "phonebooks"],
    queryFn: fetchSmsPhonebooks,
    ...smsQueryOptions,
  })

  const contactsQ = useQuery({
    queryKey: ["sms", "phonebook-contacts", selectedBook?.id],
    queryFn: () => fetchSmsPhonebookContacts(selectedBook!.id),
    enabled: !!selectedBook,
    ...smsQueryOptions,
  })

  const unavailable = booksQ.data ? isSmsUnavailable(booksQ.data) : false
  const books: Phonebook[] = unavailable ? [] : (booksQ.data?.phonebooks ?? [])
  const contacts = contactsQ.data?.contacts ?? []

  const addBook = async () => {
    if (!newName.trim()) return
    setCreatingBook(true)
    try {
      await createSmsPhonebook(newName.trim())
      toast.success(t("common.saved"))
      setNewName("")
      void qc.invalidateQueries({ queryKey: ["sms", "phonebooks"] })
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    }
    setCreatingBook(false)
  }

  const addContact = async () => {
    if (!selectedBook || !contactPhone.trim()) return
    setAddingContact(true)
    try {
      await createSmsPhonebookContact(selectedBook.id, {
        phone: contactPhone.trim(),
        name: contactName.trim() || undefined,
      })
      toast.success(t("contactAdded"))
      setContactPhone("")
      setContactName("")
      void qc.invalidateQueries({ queryKey: ["sms", "phonebook-contacts", selectedBook.id] })
    } catch (e) {
      toast.error(getApiErrorMessage(e as Error))
    }
    setAddingContact(false)
  }

  return (
    <SmsPanelShell title={t("phonebookTitle")} description={t("phonebookHint")}>
      {booksQ.isError ? (
        <SmsServiceBanner
          message={getApiErrorMessage(booksQ.error)}
          onRetry={() => void booksQ.refetch()}
        />
      ) : null}
      {unavailable ? (
        <SmsServiceBanner
          message={String((booksQ.data as { message?: string })?.message ?? "")}
          onRetry={() => void booksQ.refetch()}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("newPhonebook")}</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input
                value={newName}
                disabled={unavailable}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addBook()
                }}
              />
              <Button
                type="button"
                disabled={creatingBook || !newName.trim() || unavailable}
                onClick={() => void addBook()}
              >
                {creatingBook ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("actions.save")}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="text-base">{t("phonebook")}</CardTitle>
              <CardDescription>{t("phonebookDeleteUnavailable")}</CardDescription>
            </CardHeader>
            <CardContent>
              {booksQ.isPending ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }, (_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : books.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("noPhonebooks")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("name")}</TableHead>
                        <TableHead>#</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {books.map((b) => (
                        <TableRow
                          key={b.id}
                          className={`cursor-pointer ${selectedBook?.id === b.id ? "bg-muted" : ""}`}
                          onClick={() => setSelectedBook(b)}
                        >
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{b.id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {!selectedBook ? (
            <Card className="shadow-soft">
              <CardContent className="text-muted-foreground py-8 text-center text-sm">
                {t("selectPhonebook")}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("contacts")} — {selectedBook.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <fieldset disabled={unavailable} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>{t("contactPhone")}</Label>
                        <Input
                          className="mt-1"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="09..."
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <Label>{t("contactName")}</Label>
                        <Input
                          className="mt-1"
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={addingContact || !contactPhone.trim()}
                      onClick={() => void addContact()}
                    >
                      {addingContact ? (
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="me-2 h-4 w-4" />
                      )}
                      {t("addContact")}
                    </Button>
                  </fieldset>
                </CardContent>
              </Card>

              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle className="text-base">{t("contacts")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("contactPhone")}</TableHead>
                          <TableHead>{t("contactName")}</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contactsQ.isPending
                          ? Array.from({ length: 4 }, (_, i) => (
                              <TableRow key={i}>
                                <TableCell colSpan={3}>
                                  <Skeleton className="h-5 w-full" />
                                </TableCell>
                              </TableRow>
                            ))
                          : contacts.length === 0
                            ? (
                                <TableRow>
                                  <TableCell colSpan={3} className="text-muted-foreground text-sm">
                                    {t("noContacts")}
                                  </TableCell>
                                </TableRow>
                              )
                            : contacts.map((c) => (
                                <TableRow key={c.id}>
                                  <TableCell className="font-mono" dir="ltr">
                                    {c.phone}
                                  </TableCell>
                                  <TableCell>{c.name ?? "—"}</TableCell>
                                  <TableCell className="text-end">
                                    <Button type="button" size="sm" variant="outline" asChild>
                                      <Link
                                        href={`/admin/marketing/sms/send?to=${encodeURIComponent(c.phone)}`}
                                      >
                                        <Send className="me-1 h-3.5 w-3.5" />
                                        {t("send")}
                                      </Link>
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </SmsPanelShell>
  )
}
