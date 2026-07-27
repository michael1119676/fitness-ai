"use client";

import { Dumbbell, Eye, EyeOff, Loader2, LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  activateAppUserFromAuth,
  activateGuestAppUser,
  isAccountAuthUser,
  loadAppUsers
} from "@/lib/app-users";
import { pullCloudSnapshotToLocal, pushLocalSnapshotToCloud } from "@/lib/cloud-sync";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-client";

type AuthMode = "sign_in" | "sign_up";

function loadRecentAccountUsers() {
  return loadAppUsers().filter((user) => Boolean(user.email));
}

function isNoSnapshotError(error: unknown) {
  return error instanceof Error && error.message.includes("아직 없습니다");
}

async function restoreCloudStateIfPresent() {
  try {
    await pullCloudSnapshotToLocal();
  } catch (error) {
    if (!isNoSnapshotError(error)) throw error;
  }
}

export function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recentUsers, setRecentUsers] = useState(loadRecentAccountUsers);

  const configured = isSupabaseConfigured();
  const isSignUp = mode === "sign_up";

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      const authUser = data.session?.user ?? null;
      if (isAccountAuthUser(authUser)) {
        activateAppUserFromAuth(authUser);
        router.replace("/today");
      } else if (authUser) {
        void supabase.auth.signOut();
      }
    });
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("로그인 서버 연결 설정이 필요합니다. 배포 설정을 확인하세요.");
      return;
    }

    if (password.length < 6) {
      setMessage("비밀번호는 최소 6자 이상으로 입력하세요.");
      return;
    }

    setIsBusy(true);
    try {
      if (isSignUp) {
        const result = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: name.trim()
            }
          }
        });

        if (result.error) throw new Error(result.error.message);
        if (!result.data.session?.user) {
          setMessage("계정이 생성되었습니다. 이메일 확인이 켜져 있다면 메일 확인 후 로그인하세요.");
          return;
        }

        activateAppUserFromAuth(result.data.session.user, name);
        await pushLocalSnapshotToCloud().catch(() => undefined);
        router.replace("/today");
        return;
      }

      const result = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (result.error) throw new Error(result.error.message);
      if (!result.data.user) throw new Error("로그인 세션을 만들지 못했습니다.");

      activateAppUserFromAuth(result.data.user);
      await restoreCloudStateIfPresent();
      router.replace("/today");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인 처리 중 오류가 발생했습니다.");
    } finally {
      setRecentUsers(loadRecentAccountUsers());
      setIsBusy(false);
    }
  }

  function continueAsGuest() {
    activateGuestAppUser();
    setRecentUsers(loadRecentAccountUsers());
    setMessage("");
    router.replace("/today");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 text-ink">
      <div className="grid w-full gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-stretch">
        <section className="flex flex-col justify-between rounded-md border border-line bg-ink p-5 text-white shadow-soft">
          <div>
            <span className="grid size-11 place-items-center rounded-md bg-white text-ink">
              <Dumbbell size={22} aria-hidden />
            </span>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-mint">
              Fitness AI
            </p>
            <h1 className="mt-2 text-3xl font-semibold md:text-4xl">오늘 운동 시작하기</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              계정으로 기록을 이어가거나, 먼저 둘러보면서 루틴 흐름을 확인할 수 있습니다.
            </p>
          </div>
          <div className="mt-8 grid gap-2 text-sm text-slate-300">
            {recentUsers.length > 0 ? (
              <div className="rounded-md bg-white/8 px-3 py-3">
                <p className="text-xs font-semibold text-slate-400">최근 계정</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recentUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setEmail(user.email ?? "")}
                      className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white"
                    >
                      {user.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {!configured ? (
              <div className="rounded-md bg-amber-400/15 px-3 py-3 text-amber-100">
                Supabase URL과 publishable key가 필요합니다.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-md border border-line bg-white p-4 shadow-soft md:p-5">
          <div className="grid grid-cols-2 rounded-md bg-panel p-1">
            <button
              type="button"
              onClick={() => setMode("sign_in")}
              className={`min-h-10 rounded-md text-sm font-semibold ${
                mode === "sign_in" ? "bg-white text-ink shadow-soft" : "text-slate-500"
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => setMode("sign_up")}
              className={`min-h-10 rounded-md text-sm font-semibold ${
                mode === "sign_up" ? "bg-white text-ink shadow-soft" : "text-slate-500"
              }`}
            >
              계정 만들기
            </button>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            {isSignUp ? (
              <Field
                label="이름"
                id="account-name"
                value={name}
                onChange={setName}
                autoComplete="name"
                placeholder="예: Michael"
              />
            ) : null}
            <Field
              label="이메일"
              id="account-email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <div>
              <label htmlFor="account-password" className="text-sm font-semibold text-slate-700">
                비밀번호
              </label>
              <div className="relative mt-2">
                <input
                  id="account-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  className="min-h-12 w-full rounded-md border border-line bg-white px-3 pr-12 text-sm font-medium"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-1 top-1 grid size-10 place-items-center rounded-md text-slate-500"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  title={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!configured || isBusy}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isBusy ? (
                <Loader2 size={17} className="animate-spin" aria-hidden />
              ) : isSignUp ? (
                <UserPlus size={17} aria-hidden />
              ) : (
                <LogIn size={17} aria-hidden />
              )}
              {isSignUp ? "계정 만들기" : "로그인"}
            </button>
          </form>

          {message ? (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              {message}
            </p>
          ) : null}

          <div className="mt-5 border-t border-line pt-5">
            <button
              type="button"
              onClick={continueAsGuest}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink shadow-soft"
            >
              <Dumbbell size={17} aria-hidden />
              계정 없이 둘러보기
            </button>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              회원가입 없이 앱을 먼저 확인합니다. 기록은 이 브라우저에만 저장됩니다.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  id,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  required = false
}: {
  label: string;
  id: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        className="mt-2 min-h-12 w-full rounded-md border border-line bg-white px-3 text-sm font-medium"
      />
    </div>
  );
}
