"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useActionState, useEffect, useState } from "react"
import { AuthForm } from "@/components/auth-form"
import { SubmitButton } from "@/components/submit-button"
import { toast } from "@/components/toast"
import { type RegisterActionState, register } from "../actions"
import { StonkAILogo } from "@/components/elements/stonk-ai-logo"

export default function Page() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [isSuccessful, setIsSuccessful] = useState(false)

  const [state, formAction] = useActionState<RegisterActionState, FormData>(register, {
    status: "idle",
  })

  const { update: updateSession } = useSession()

  useEffect(() => {
    if (state.status === "user_exists") {
      toast({ type: "error", description: "Account already exists!" })
    } else if (state.status === "failed") {
      toast({ type: "error", description: "Failed to create account!" })
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "Failed validating your submission!",
      })
    } else if (state.status === "success") {
      toast({ type: "success", description: "Account created successfully!" })

      setIsSuccessful(true)
      updateSession()
      router.push("/")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string)
    formAction(formData)
  }

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-gradient-to-br from-background via-background to-secondary">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col gap-8 overflow-hidden rounded-2xl bg-card shadow-xl border border-border">
        <div className="bg-gradient-to-r from-primary to-primary/80 px-6 py-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex items-center justify-center gap-2 mb-2">
                        <StonkAILogo/>
            </div>
          </div>
          <p className="text-primary-foreground/80 text-sm font-medium">AI-Powered Financial Intelligence</p>
        </div>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <div className="flex flex-col gap-2 text-center">
            <h2 className="text-xl font-semibold text-foreground">Get Started</h2>
            <p className="text-sm text-muted-foreground">Create an account to access AI-powered financial insights</p>
          </div>

          <AuthForm action={handleSubmit} defaultEmail={email}>
            <SubmitButton isSuccessful={isSuccessful}>Sign Up</SubmitButton>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {"Already have an account? "}
              <Link className="font-semibold text-primary hover:text-primary/80 transition-colors" href="/login">
                Sign in
              </Link>
              {" instead."}
            </p>
          </AuthForm>
        </div>
      </div>
    </div>
  )
}
