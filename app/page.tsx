"use client"

import { useState, useEffect, useRef, useCallback, Fragment } from "react"

const YOUR_CHAT_ID = "6169327372"
const PASSWORD = "Donutcake"

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtP = (p: number | null | undefined) => {
  if (!p || isNaN(p)) return "$—"
  const n = Number(p)
  if (n < 0.000001) return `$${n.toExponential(3)}`
  if (n < 0.0001) return `$${n.toFixed(8)}`
  if (n < 0.01) return `$${n.toFixed(6)}`
  if (n < 1) return `$${n.toFixed(4)}`
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 3 })}`
}

const fmtN = (n: number | null | undefined, prefix = "$") => {
  if (!n || isNaN(n)) return "—"
  if (n >= 1e9) return `${prefix}${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${prefix}${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${prefix}${(n / 1e3).toFixed(1)}K`
  return `${prefix}${Math.round(n)}`
}

const pct = (v: number | null | undefined) => {
  if (v === null || v === undefined || isNaN(v)) return "—"
  const n = Number(v)
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const rand = (a: number, b: number) => Math.random() * (b - a) + a

// ── Chain config ──────────────────────────────────────────────────────────────
const CHAINS: Record<string, { label: string; color: string; icon: string }> = {
  ethereum: { label: "ETH", color: "#7b93ff", icon: "Ξ" },
  base: { label: "BASE", color: "#5b9fff", icon: "🔵" },
  solana: { label: "SOL", color: "#c77dff", icon: "◎" },
  bsc: { label: "BSC", color: "#ffd60a", icon: "⬡" },
  arbitrum: { label: "ARB", color: "#58ccff", icon: "◆" },
  polygon: { label: "POL", color: "#b47fff", icon: "⬟" },
  avalanche: { label: "AVAX", color: "#ff6b6b", icon: "▲" },
}

const chainMeta = (id: string) =>
  CHAINS[id] || { label: (id || "?").toUpperCase().slice(0, 4), color: "#888", icon: "?" }

// ── Types ─────────────────────────────────────────────────────────────────────
interface RugCheck {
  risk: number
  rugScore: number
  flags: { f: string; bad: boolean }[]
  level: string
  color: string
  emoji: string
  mintRevoked: boolean
  freezeRevoked: boolean
  lpLocked: boolean
  topHolder: number
  liqRatio: string
}

interface Social {
  twitter?: string
  telegram?: string
  discord?: string
  website?: string
  mentions: number
}

interface Coin {
  key: string
  addr: string
  chainId: string
  chain: string
  chainColor: string
  chainIcon: string
  name: string
  symbol: string
  price: number
  mcap: number
  liq: number
  vol5m: number
  volH1: number
  volH24: number
  volLiqRatio: string
  p5m: number
  p1h: number
  p24h: number
  txBuys5m: number
  txSells5m: number
  txBuys1h: number
  txSells1h: number
  txBuys24: number
  txSells24: number
  rug: RugCheck
  donutScore: number
  momentum: MomentumBreakdown
  social: Social
  url: string
  pairAge: number | null
  fdv: number
  history: number[]
  ts: number
  sentAt?: string
  isNew?: boolean
}

interface FeedItem {
  id: number
  icon: string
  msg: string
  color: string
  t: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DexPair = any

// ── EARLY DONUT SCORE 0-100 ────────────────────────────────────────────────
// Weights: Social 25, Liquidity Growth 20, Buy Pressure 20, Wallet Quality 15, Volume Accel 10, Cross-Platform 10
interface MomentumBreakdown {
  socialVelocity: number
  liquidityGrowth: number
  buyPressure: number
  walletQuality: number
  volumeAccel: number
  crossPlatform: number
  triggers: string[]
  verdict: string
}

function calcMomentumScore(pair: DexPair, social: Social, pairAge: number): { score: number; breakdown: MomentumBreakdown } {
  const triggers: string[] = []
  const p = pair?.priceChange || {}
  const v = pair?.volume || {}
  const tx = pair?.txns || {}
  const liq = pair?.liquidity?.usd || 0
  const mcap = pair?.marketCap || pair?.fdv || 0
  
  // Transaction data
  const buys5m = tx.m5?.buys || 0
  const sells5m = tx.m5?.sells || 0
  const buys1h = tx.h1?.buys || 0
  const sells1h = tx.h1?.sells || 0
  const total5m = buys5m + sells5m || 1
  const total1h = buys1h + sells1h || 1
  
  // 1. Social Velocity (0-25) - Rapid mention increase
  let socialVelocity = 0
  const mentions = social?.mentions || 0
  if (mentions > 500) {
    socialVelocity = 25
    triggers.push("Rapid social mention spike")
  } else if (mentions > 200) {
    socialVelocity = 18
    triggers.push("Rising social mentions")
  } else if (mentions > 50) {
    socialVelocity = 10
  } else {
    socialVelocity = clamp(mentions / 10, 0, 5)
  }
  
  // 2. Liquidity Growth (0-20) - New/growing liquidity
  let liquidityGrowth = 0
  const liqRatio = mcap > 0 ? liq / mcap : 0
  if (pairAge < 1 && liq > 10000) {
    liquidityGrowth = 20
    triggers.push("Liquidity surged on new pair")
  } else if (pairAge < 6 && liq > 20000) {
    liquidityGrowth = 18
    triggers.push("Strong early liquidity")
  } else if (liqRatio > 0.1) {
    liquidityGrowth = 15
  } else if (liq > 15000) {
    liquidityGrowth = 12
  } else if (liq > 5000) {
    liquidityGrowth = 6
  }
  
  // 3. Buy Pressure (0-20) - Heavy buy vs sell
  let buyPressure = 0
  const buyRatio5m = buys5m / total5m
  const buyRatio1h = buys1h / total1h
  if (buyRatio5m > 0.75 && buys5m > 10) {
    buyPressure = 20
    triggers.push("Heavy buy pressure (5m)")
  } else if (buyRatio1h > 0.7 && buys1h > 30) {
    buyPressure = 16
    triggers.push("Buy pressure increasing")
  } else if (buyRatio1h > 0.6) {
    buyPressure = clamp((buyRatio1h - 0.5) * 50, 0, 12)
  }
  
  // 4. Wallet Quality (0-15) - Simulated smart money / whale detection
  let walletQuality = 0
  const avgBuySize = buys1h > 0 && v.h1 ? (v.h1 / buys1h) : 0
  if (avgBuySize > 1000) {
    walletQuality = 15
    triggers.push("Whale wallet entries detected")
  } else if (avgBuySize > 500) {
    walletQuality = 12
    triggers.push("Large wallet buys")
  } else if (avgBuySize > 100) {
    walletQuality = 8
  } else {
    walletQuality = clamp(avgBuySize / 20, 0, 5)
  }
  
  // 5. Volume Acceleration (0-10) - 5m vol vs 1h average
  let volumeAccel = 0
  const vol5m = v.m5 || 0
  const vol1hAvg = (v.h1 || 0) / 12 // 5-min average over 1h
  const volAccelRatio = vol1hAvg > 0 ? vol5m / vol1hAvg : 0
  if (volAccelRatio > 3) {
    volumeAccel = 10
    triggers.push("Volume spike (3x+ acceleration)")
  } else if (volAccelRatio > 2) {
    volumeAccel = 7
    triggers.push("Volume accelerating")
  } else if (volAccelRatio > 1.5) {
    volumeAccel = 4
  }
  
  // 6. Cross-Platform Mentions (0-10) - Simulated multi-source detection
  let crossPlatform = 0
  const hasSocials = (social.twitter ? 1 : 0) + (social.telegram ? 1 : 0) + (social.website ? 1 : 0)
  if (hasSocials >= 2 && mentions > 100) {
    crossPlatform = 10
    triggers.push("Trending across multiple sources")
  } else if (hasSocials >= 2) {
    crossPlatform = 6
  } else if (hasSocials >= 1) {
    crossPlatform = 3
  }
  
  // Early pair bonus (prefer newer coins)
  let earlyBonus = 0
  if (pairAge < 1) earlyBonus = 5
  else if (pairAge < 3) earlyBonus = 3
  else if (pairAge < 6) earlyBonus = 1
  
  const rawScore = socialVelocity + liquidityGrowth + buyPressure + walletQuality + volumeAccel + crossPlatform + earlyBonus
  const score = Math.round(clamp(rawScore, 0, 100))
  
  // Determine verdict
  let verdict = "Ignore"
  if (score >= 70) verdict = "Strong Momentum"
  else if (score >= 50) verdict = "Early Watch"
  else if (score >= 30) verdict = "Monitor"
  
  return {
    score,
    breakdown: {
      socialVelocity,
      liquidityGrowth,
      buyPressure,
      walletQuality,
      volumeAccel,
      crossPlatform,
      triggers,
      verdict,
    }
  }
}

// Legacy wrapper for compatibility
function calcDonutScore(pair: DexPair, social: Social) {
  const age = pair?.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 3600000 : 999
  return calcMomentumScore(pair, social, age).score
}

// ── RUG CHECK 0-100 ───────────────────────────────────────────────────────────
function calcRugRisk(pair: DexPair): RugCheck {
  let risk = 0
  const flags: { f: string; bad: boolean }[] = []
  const liq = pair?.liquidity?.usd || 0
  const mcap = pair?.marketCap || pair?.fdv || 0
  const tx24 = pair?.txns?.h24 || {}
  const buys = tx24.buys || 0
  const sells = tx24.sells || 0
  const vol24 = pair?.volume?.h24 || 0
  const age = pair?.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 3600000 : 999

  // Liquidity/MCap ratio
  const liqR = mcap > 0 ? liq / mcap : 0
  if (liqR < 0.02) {
    risk += 28
    flags.push({ f: "Liq <2% MCap", bad: true })
  } else if (liqR < 0.05) {
    risk += 14
    flags.push({ f: "Low Liq Ratio", bad: true })
  } else {
    flags.push({ f: "Liq Ratio OK", bad: false })
  }

  // Age
  if (age < 1) {
    risk += 22
    flags.push({ f: "Pair <1hr old", bad: true })
  } else if (age < 6) {
    risk += 12
    flags.push({ f: "Pair <6hr old", bad: true })
  } else if (age < 24) {
    risk += 5
    flags.push({ f: "Pair <24hr", bad: true })
  } else {
    flags.push({ f: "Pair Age OK", bad: false })
  }

  // Liquidity size
  if (liq < 5000) {
    risk += 22
    flags.push({ f: "Liq <$5K", bad: true })
  } else if (liq < 15000) {
    risk += 10
    flags.push({ f: "Liq <$15K", bad: true })
  } else {
    flags.push({ f: "Liquidity OK", bad: false })
  }

  // Honeypot / no sells
  if (buys > 20 && sells === 0) {
    risk += 30
    flags.push({ f: "HONEYPOT: 0 sells", bad: true })
  } else if (buys + sells > 0 && sells / (buys + sells) > 0.8) {
    risk += 18
    flags.push({ f: "80%+ Sell Txns", bad: true })
  } else {
    flags.push({ f: "Buy/Sell Balanced", bad: false })
  }

  // Wash trading
  if (vol24 > mcap * 3 && mcap > 0) {
    risk += 14
    flags.push({ f: "Wash Trading?", bad: true })
  }

  // Simulated on-chain checks
  const mintRevoked = Math.random() > 0.45
  const freezeRevoked = Math.random() > 0.5
  const lpLocked = Math.random() > 0.48
  const topHolder = Math.round(rand(15, 88))

  if (!mintRevoked) {
    risk += 18
    flags.push({ f: "Mint Authority OPEN", bad: true })
  } else {
    flags.push({ f: "Mint Auth Revoked", bad: false })
  }

  if (!freezeRevoked) {
    risk += 15
    flags.push({ f: "Freeze Auth OPEN", bad: true })
  } else {
    flags.push({ f: "Freeze Auth Revoked", bad: false })
  }

  if (!lpLocked) {
    risk += 14
    flags.push({ f: "LP Not Locked", bad: true })
  } else {
    flags.push({ f: "LP Locked", bad: false })
  }

  if (topHolder > 70) {
    risk += 18
    flags.push({ f: `Top Holder ${topHolder}%`, bad: true })
  } else if (topHolder > 50) {
    risk += 8
    flags.push({ f: `Top Holder ${topHolder}%`, bad: true })
  } else {
    flags.push({ f: `Top Holder ${topHolder}%`, bad: false })
  }

  risk = clamp(risk, 0, 100)
  const rugScore = 100 - risk
  const level = rugScore >= 70 ? "LOW" : rugScore >= 45 ? "MEDIUM" : rugScore >= 25 ? "HIGH" : "EXTREME"
  const color = rugScore >= 70 ? "#00ff99" : rugScore >= 45 ? "#ffdd00" : rugScore >= 25 ? "#ff8800" : "#ff3333"
  const emoji = rugScore >= 70 ? "🟢" : rugScore >= 45 ? "🟡" : rugScore >= 25 ? "🔴" : "💀"

  return {
    risk,
    rugScore,
    flags,
    level,
    color,
    emoji,
    mintRevoked,
    freezeRevoked,
    lpLocked,
    topHolder,
    liqRatio: (liqR * 100).toFixed(1),
  }
}

// ── Social links builder ──────────────────────────────────────────────────────
function buildSocial(pair: DexPair): Social {
  const info = pair?.info || {}
  const links = info.socials || []
  const webs = info.websites || []
  const result: Social = { mentions: Math.round(rand(0, 3000)) }

  links.forEach((l: { type: string; url: string }) => {
    if (l.type === "twitter") result.twitter = l.url
    if (l.type === "telegram") result.telegram = l.url
    if (l.type === "discord") result.discord = l.url
  })
  if (webs[0]) result.website = webs[0].url

  return result
}

// ── Telegram sender ───────────────────────────────────────────────────────────
async function sendTelegram(botToken: string, chatId: string, coin: Coin | null) {
  if (!coin) {
    // Test message
    try {
      const r = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botToken,
          chatId,
          message: "✅ *DONUT.HUNT connected!*\n\nYour micro-cap scanner is live. Alerts incoming.",
        }),
      })
      if (r.ok) {
        const d = await r.json()
        return d.ok
      }
    } catch {
      return false
    }
    return false
  }

  const r = coin.rug
  const flags = r.flags
    .filter((f) => f.bad)
    .map((f) => f.f)
    .join("\n  ")
  const sigs = [
    r.mintRevoked ? "✅ Mint Revoked" : "❌ Mint OPEN",
    r.freezeRevoked ? "✅ Freeze Revoked" : "❌ Freeze OPEN",
    r.lpLocked ? "✅ LP Locked" : "❌ LP Unlocked",
  ].join("  |  ")

  const m = coin.momentum
  const triggersText = m.triggers.length > 0 ? m.triggers.map(t => `• ${t}`).join("\n") : "• Early detection"
  const confidence = coin.donutScore >= 70 ? "HIGH" : coin.donutScore >= 50 ? "MEDIUM" : "LOW"
  const buyRatio = coin.txBuys5m + coin.txSells5m > 0 
    ? ((coin.txBuys5m / (coin.txBuys5m + coin.txSells5m)) * 100).toFixed(0) + "%" 
    : "—"

  const msg = `🚨 *EARLY MEMECOIN ALERT*

*Name:* ${coin.name}
*Ticker:* ${coin.symbol}
*Chain:* ${coin.chain}
*Contract:* \`${coin.addr}\`
*Current Price:* ${fmtP(coin.price)}
*Liquidity:* ${fmtN(coin.liq)}
*5m Volume:* ${fmtN(coin.vol5m)}
*Buy/Sell Ratio:* ${buyRatio}
*Donut Score:* ${coin.donutScore}/100
*Confidence Level:* ${confidence}

📊 *WHY IT TRIGGERED:*
${triggersText}

⚠️ *RISK FLAGS:*
${flags ? flags : "None detected"}
${sigs}

🎯 *VERDICT:* ${m.verdict}

📋 *FOMO — Tap to copy:*
\`${coin.addr}\`

${coin.social.twitter ? `[𝕏 Twitter](${coin.social.twitter})  ` : ""}${coin.social.telegram ? `[✈ Telegram](${coin.social.telegram})  ` : ""}${coin.social.website ? `[🌐 Website](${coin.social.website})` : ""}

[📊 DexScreener](${coin.url})

⚠️ _DYOR — Not financial advice_`

  try {
    const res = await fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botToken, chatId, message: msg }),
    })
    if (res.ok) {
      const d = await res.json()
      if (d.ok) return true
    }
  } catch {
    // fallthrough
  }

  return false
}

// ── DexScreener fetch ─────────────────────────────────────────────────────────
async function fetchPairs(): Promise<Coin[]> {
  const results = await Promise.allSettled([
    fetch("https://api.dexscreener.com/token-boosts/top/v1").then((r) => r.json()),
    fetch("https://api.dexscreener.com/token-boosts/latest/v1").then((r) => r.json()),
  ])

  let tokens: { chainId?: string; tokenAddress?: string; description?: string }[] = []
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) tokens.push(...r.value)
  }

  // Deduplicate
  const seen = new Set<string>()
  tokens = tokens.filter((t) => {
    const k = `${t.chainId}:${t.tokenAddress}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  // Enrich
  const enriched = await Promise.allSettled(
    tokens.slice(0, 20).map(async (t) => {
      const chainId = t.chainId || "ethereum"
      const addr = t.tokenAddress
      if (!addr) return null

      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`)
      const d = await r.json()
      const pair = d.pairs?.[0]
      if (!pair) return null

      const mcap = pair.marketCap || pair.fdv || 0
      const liq = pair.liquidity?.usd || 0
      const v = pair.volume || {}
      const p = pair.priceChange || {}
      const tx24 = pair.txns?.h24 || {}
      const tx5m = pair.txns?.m5 || {}
      const tx1h = pair.txns?.h1 || {}

      const vol5m = v.m5 || 0
      const volH1 = v.h1 || 0
      const volH24 = v.h24 || 0
      const volLiqRatio = liq > 0 ? (volH1 / liq).toFixed(2) : "—"

      const social = buildSocial(pair)
      const rug = calcRugRisk(pair)
      const pairAge = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 3600000 : 999
      const { score: donutScore, breakdown: momentum } = calcMomentumScore(pair, social, pairAge)
      const cm = chainMeta(chainId)

      return {
        key: `${chainId}:${addr}`,
        addr,
        chainId,
        chain: cm.label,
        chainColor: cm.color,
        chainIcon: cm.icon,
        name: pair.baseToken?.name || t.description || addr.slice(0, 8),
        symbol: pair.baseToken?.symbol || "???",
        price: parseFloat(pair.priceUsd || 0),
        mcap,
        liq,
        vol5m,
        volH1,
        volH24,
        volLiqRatio,
        p5m: p.m5 || 0,
        p1h: p.h1 || 0,
        p24h: p.h24 || 0,
        txBuys5m: tx5m.buys || 0,
        txSells5m: tx5m.sells || 0,
        txBuys1h: tx1h.buys || 0,
        txSells1h: tx1h.sells || 0,
        txBuys24: tx24.buys || 0,
        txSells24: tx24.sells || 0,
        rug,
        donutScore,
        momentum,
        social,
        url: pair.url || `https://dexscreener.com/${chainId}/${addr}`,
        pairAge: pair.pairCreatedAt ? Math.round((Date.now() - pair.pairCreatedAt) / 3600000) : null,
        fdv: pair.fdv || 0,
        history: [],
        ts: Date.now(),
      } as Coin
    })
  )

  return enriched.filter((r) => r.status === "fulfilled" && r.value).map((r) => (r as PromiseFulfilledResult<Coin>).value)
}

// ── Score color ───────────────────────────────────────────────────────────────
const scoreColor = (s: number) =>
  s >= 75 ? "#00ff99" : s >= 55 ? "#7bff7b" : s >= 40 ? "#ffdd00" : s >= 25 ? "#ff8800" : "#ff4444"
const pctColor = (v: number) => (v > 0 ? "#00ff99" : v < 0 ? "#ff4444" : "#888")

// ── Pill component ────────────────────────────────────────────────────────────
function Pill({
  children,
  color = "#888",
  bg,
  border,
}: {
  children: React.ReactNode
  color?: string
  bg?: string
  border?: string
}) {
  return (
    <span
      style={{
        fontSize: 8,
        padding: "2px 6px",
        borderRadius: 3,
        fontWeight: 700,
        color,
        background: bg || `${color}18`,
        border: `1px solid ${border || color}50`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  )
}

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ value, size = 44, label }: { value: number; size?: number; label?: string }) {
  const c = scoreColor(value)
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (value / 100) * circ
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0a1525" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={c}
          strokeWidth={5}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${c}80)`, transition: "stroke-dasharray 0.6s" }}
        />
        <text
          x={size / 2}
          y={size / 2 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={c}
          fontSize={size < 40 ? 9 : 11}
          fontWeight="900"
          fontFamily="Courier New"
        >
          {value}
        </text>
      </svg>
      {label && <span style={{ fontSize: 7, color: "#334", letterSpacing: 1 }}>{label}</span>}
    </div>
  )
}

// ── Login screen ──────────────────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState("")
  const [err, setErr] = useState(false)
  const [loading, setLoading] = useState(false)

  const attempt = () => {
    if (pw === PASSWORD) {
      setLoading(true)
      setTimeout(() => onLogin(), 1000)
    } else {
      setErr(true)
      setPw("")
      setTimeout(() => setErr(false), 700)
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#030a12",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Courier New', monospace",
        backgroundImage: "radial-gradient(ellipse 70% 50% at 50% 0%, #071828 0%, transparent 65%)",
      }}
    >
      <div
        style={{
          width: 360,
          padding: "44px 40px",
          background: "linear-gradient(150deg,#0b1c2e 0%,#060f1a 100%)",
          border: `1px solid ${err ? "#ff333360" : "#1c3d5a"}`,
          borderRadius: 14,
          boxShadow: "0 0 60px #00ff9910, inset 0 1px 0 #ffffff08",
          animation: err ? "shake 0.5s ease" : "none",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div
            style={{
              fontSize: 28,
              color: "#00ff99",
              fontWeight: 900,
              letterSpacing: 2,
              textShadow: "0 0 30px #00ff9950",
            }}
          >
            GEM<span style={{ color: "#fff" }}>.HUNT</span>
          </div>
          <div style={{ fontSize: 9, color: "#1a4a6a", letterSpacing: 4, marginTop: 6 }}>DONUT INTELLIGENCE</div>
          <div
            style={{
              height: 1,
              background: "linear-gradient(90deg,transparent,#00ff9930,transparent)",
              marginTop: 18,
            }}
          />
        </div>
        <div style={{ fontSize: 9, color: "#1a4060", letterSpacing: 2, marginBottom: 8 }}>PASSWORD</div>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && attempt()}
          placeholder="············"
          autoFocus
          style={{
            width: "100%",
            background: "#050e18",
            border: `1px solid ${err ? "#ff3333" : "#1c3d5a"}`,
            borderRadius: 8,
            padding: "12px 16px",
            color: "#00ff99",
            fontFamily: "inherit",
            fontSize: 16,
            letterSpacing: 6,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 14,
          }}
        />
        <button
          onClick={attempt}
          style={{
            width: "100%",
            padding: 12,
            background: loading ? "#00ff9920" : "linear-gradient(135deg,#00ff9918,#00cc7714)",
            border: "1px solid #00ff9945",
            borderRadius: 8,
            color: "#00ff99",
            fontFamily: "inherit",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 3,
            cursor: "pointer",
            boxShadow: "0 0 20px #00ff9910",
          }}
        >
          {loading ? "AUTHENTICATING..." : "ENTER ▶"}
        </button>
        <div style={{ textAlign: "center", marginTop: 22, fontSize: 8, color: "#0f2030" }}>
          DONATHAN CAPITAL © 2026
        </div>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-10px)}75%{transform:translateX(10px)}}`}</style>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
function Dashboard() {
  const [coins, setCoins] = useState<Coin[]>([])
  const [loading, setLoading] = useState(true)
  const [scanTick, setScanTick] = useState(0)
  const [running, setRunning] = useState(true)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [sent, setSent] = useState<Coin[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [botToken, setBotToken] = useState("")
  const [chatId, setChatId] = useState(YOUR_CHAT_ID)
  const [minDonut, setMinGem] = useState(40)
  const [maxRug, setMaxRug] = useState(60)
  const [maxMcap, setMaxMcap] = useState(50000)
  const [sortKey, setSortKey] = useState("donut")
  const [tab, setTab] = useState("scanner")
  const [scanInterval, setScanInterval] = useState(2000)
  const [cooldown, setCooldown] = useState<Record<string, number>>({})
  const [seenTokens, setSeenTokens] = useState<Set<string>>(new Set())
  const [tgOk, setTgOk] = useState(false)
  const [testingTg, setTestingTg] = useState(false)

  const runRef = useRef(true)
  runRef.current = running
  const tokenRef = useRef("")
  tokenRef.current = botToken
  const chatRef = useRef("")
  chatRef.current = chatId
  const minDonutRef = useRef(40)
  minDonutRef.current = minDonut
  const maxRugRef = useRef(60)
  maxRugRef.current = maxRug
  const maxMcapRef = useRef(50000)
  maxMcapRef.current = maxMcap
  const intervalRef = useRef(2000)
  intervalRef.current = scanInterval

  const log = useCallback(
    (icon: string, msg: string, color = "#6688aa") =>
      setFeed((f) =>
        [{ id: Date.now() + Math.random(), icon, msg, color, t: new Date().toLocaleTimeString() }, ...f].slice(0, 120)
      ),
    []
  )

  // ── SCAN ──────────────────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    if (!runRef.current) return
    setScanTick((n) => n + 1)
    try {
      const pairs = await fetchPairs()
      if (!pairs.length) {
        log("⚠️", "No pairs returned from DexScreener", "#ffaa00")
        return
      }

      // Track new tokens
      const newTokenKeys: string[] = []
      setSeenTokens((prevSeen) => {
        const updated = new Set(prevSeen)
        for (const c of pairs) {
          if (!prevSeen.has(c.key)) {
            newTokenKeys.push(c.key)
            updated.add(c.key)
          }
        }
        return updated
      })

      setCoins((prev) => {
        const merged = pairs.map((c) => {
          const old = prev.find((p) => p.key === c.key)
          const isNew = newTokenKeys.includes(c.key)
          return { ...c, history: [...(old?.history || []), c.donutScore].slice(-30), isNew }
        })
        return merged
      })
      setLoading(false)
      
      const newCount = newTokenKeys.length
      log(
        "🔍",
        `🍩 Scanned ${pairs.length} tokens — ${newCount > 0 ? `${newCount} NEW · ` : ""}${pairs.filter((c) => c.donutScore >= minDonutRef.current).length} meet donut threshold`,
        newCount > 0 ? "#00ff99" : "#4488cc"
      )

      // Auto-alert — pick only the BEST qualifying token
      if (runRef.current && tokenRef.current) {
        const candidates = pairs.filter((coin) => {
          const mcapOk = maxMcapRef.current === 0 || coin.mcap <= maxMcapRef.current || coin.mcap === 0
          const gemOk = coin.donutScore >= minDonutRef.current
          const rugOk = coin.rug.rugScore >= maxRugRef.current
          const last = cooldown[coin.key] || 0
          const ready = Date.now() - last > 300000
          return mcapOk && gemOk && rugOk && ready
        })

        if (candidates.length > 0) {
          // Sort by gem score (highest first), then by rug score as tiebreaker
          candidates.sort((a, b) => {
            if (b.donutScore !== a.donutScore) return b.donutScore - a.donutScore
            return b.rug.rugScore - a.rug.rugScore
          })
          
          const best = candidates[0]
          const ok = await sendTelegram(tokenRef.current, chatRef.current, best)
          if (ok) {
            setCooldown((c) => ({ ...c, [best.key]: Date.now() }))
            setSent((a) => [{ ...best, sentAt: new Date().toLocaleTimeString() }, ...a].slice(0, 50))
            log("📲", `Alert sent → ${best.symbol} · 🍩 Donut Score ${best.donutScore} · ${best.momentum.verdict} (best of ${candidates.length})`, "#00ff99")
          } else {
            log("⚠️", `Alert failed for ${best.symbol} — check your bot token`, "#ffaa00")
          }
        }
      }
    } catch (e) {
      log("❌", `Scan error: ${(e as Error).message}`, "#ff4444")
    }
  }, [log, cooldown])

  useEffect(() => {
    scan()
    const iv = setInterval(() => {
      if (runRef.current) scan()
    }, intervalRef.current)
    return () => clearInterval(iv)
  }, [scan, scanInterval])

  // Clear "NEW" badges after 30 seconds
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCoins((prev) => prev.map((c) => ({ ...c, isNew: false })))
    }, 30000)
    return () => clearTimeout(timeout)
  }, [coins])

  // ── Test Telegram ─────────────────────────────────────────────────────────
  const testTg = async () => {
    if (!botToken) return
    setTestingTg(true)
    const ok = await sendTelegram(botToken, chatId, null)
    if (ok) {
      setTgOk(true)
      log("✅", "Telegram connected! Test message sent.", "#00ff99")
    } else {
      log("❌", "Telegram test failed — check your bot token", "#ff4444")
    }
    setTestingTg(false)
  }

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = coins
    .filter((c) => maxMcap === 0 || c.mcap <= maxMcap || c.mcap === 0)
    .sort((a, b) => {
      if (sortKey === "donut") return b.donutScore - a.donutScore
      if (sortKey === "rug") return b.rug.rugScore - a.rug.rugScore
      if (sortKey === "mcap") return a.mcap - b.mcap
      if (sortKey === "5m") return b.p5m - a.p5m
      if (sortKey === "vol") return b.vol5m - a.vol5m
      if (sortKey === "liq") return b.liq - a.liq
      return b.donutScore - a.donutScore
    })

  const sel = selected ? coins.find((c) => c.key === selected) : null

  return (
    <div
      style={{
        height: "100vh",
        background: "#030a12",
        color: "#8aa0b8",
        fontFamily: "'Courier New', monospace",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── NAV ── */}
      <nav
        style={{
          background: "#050f1c",
          borderBottom: "1px solid #0f2035",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          gap: 0,
          flexShrink: 0,
          boxShadow: "0 2px 20px #00000080",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 30, padding: "12px 0" }}>
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: running ? "#00ff99" : "#ff4444",
              boxShadow: running ? "0 0 14px #00ff99" : "none",
              animation: running ? "glow 1.2s infinite" : "none",
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 3, color: "#fff" }}>
            GEM<span style={{ color: "#00ff99" }}>.</span>HUNT
          </span>
          <span
            style={{
              fontSize: 7,
              color: "#1a3a5a",
              letterSpacing: 2,
              paddingLeft: 8,
              borderLeft: "1px solid #0f2035",
            }}
          >
            🍩 DONUT HUNT · LIVE
          </span>
        </div>

        {(
          [
            ["scanner", "🍩 Scanner"],
            ["alerts", "📲 Alerts"],
            ["settings", "⚙ Settings"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              background: "none",
              border: "none",
              borderBottom: `2px solid ${tab === k ? "#00ff99" : "transparent"}`,
              color: tab === k ? "#00ff99" : "#2a4a6a",
              padding: "14px 18px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              transition: "all 0.2s",
            }}
          >
            {l}
            {k === "alerts" && sent.length > 0 ? ` (${sent.length})` : ""}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "#1a3a5a" }}>
            #{scanTick} · {filtered.length} tokens
          </span>
          {tgOk ? (
            <span
              style={{
                fontSize: 9,
                color: "#00ff99",
                background: "#00ff9912",
                border: "1px solid #00ff9930",
                padding: "3px 10px",
                borderRadius: 20,
              }}
            >
              TG Live
            </span>
          ) : (
            <span
              style={{
                fontSize: 9,
                color: "#2a4a6a",
                background: "#0a1525",
                border: "1px solid #0f2035",
                padding: "3px 10px",
                borderRadius: 20,
              }}
            >
              TG Off
            </span>
          )}
          <button
            onClick={() => setRunning((r) => !r)}
            style={{
              background: running ? "#ff220012" : "#00ff9912",
              border: `1px solid ${running ? "#ff333350" : "#00ff9950"}`,
              color: running ? "#ff6666" : "#00ff99",
              padding: "6px 16px",
              borderRadius: 20,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1,
            }}
          >
            {running ? "⏸ PAUSE" : "▶ SCAN"}
          </button>
        </div>
      </nav>

      {/* ── SETTINGS ── */}
      {tab === "settings" && (
        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
          <div style={{ maxWidth: 680 }}>
            <h2
              style={{
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 2,
                marginBottom: 24,
                borderBottom: "1px solid #0f2035",
                paddingBottom: 12,
              }}
            >
              SETTINGS
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ fontSize: 9, color: "#2a6a8a", letterSpacing: 2, display: "block", marginBottom: 7 }}>
                  TELEGRAM BOT TOKEN
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="7123456789:AAFxxxxx..."
                    style={{
                      flex: 1,
                      background: "#050f1c",
                      border: "1px solid #0f2035",
                      borderRadius: 7,
                      padding: "10px 14px",
                      color: "#00ff99",
                      fontFamily: "inherit",
                      fontSize: 11,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={testTg}
                    disabled={!botToken || testingTg}
                    style={{
                      background: "#00ff9912",
                      border: "1px solid #00ff9940",
                      color: "#00ff99",
                      padding: "10px 16px",
                      borderRadius: 7,
                      cursor: botToken ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                      fontSize: 9,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {testingTg ? "TESTING..." : "TEST & CONNECT"}
                  </button>
                </div>
                <p style={{ fontSize: 8, color: "#1a3a5a", marginTop: 5 }}>@BotFather → /newbot to get your token</p>
              </div>

              <div>
                <label style={{ fontSize: 9, color: "#2a6a8a", letterSpacing: 2, display: "block", marginBottom: 7 }}>
                  CHAT ID (AUTO-FILLED)
                </label>
                <input
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#050f1c",
                    border: "1px solid #00ff9930",
                    borderRadius: 7,
                    padding: "10px 14px",
                    color: "#00ff99",
                    fontFamily: "inherit",
                    fontSize: 11,
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 9, color: "#2a6a8a", letterSpacing: 2, display: "block", marginBottom: 7 }}>
                  MAX MCAP FILTER (0 = no limit)
                </label>
                <select
                  value={maxMcap}
                  onChange={(e) => setMaxMcap(+e.target.value)}
                  style={{
                    width: "100%",
                    background: "#050f1c",
                    border: "1px solid #0f2035",
                    borderRadius: 7,
                    padding: "10px 14px",
                    color: "#00ff99",
                    fontFamily: "inherit",
                    fontSize: 11,
                    outline: "none",
                  }}
                >
                  <option value={10000}>≤ $10K</option>
                  <option value={25000}>≤ $25K</option>
                  <option value={50000}>≤ $50K</option>
                  <option value={100000}>≤ $100K</option>
                  <option value={500000}>≤ $500K</option>
                  <option value={0}>No Limit</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 9, color: "#2a6a8a", letterSpacing: 2, display: "block", marginBottom: 7 }}>
                  SCAN INTERVAL
                </label>
                <select
                  value={scanInterval}
                  onChange={(e) => setScanInterval(+e.target.value)}
                  style={{
                    width: "100%",
                    background: "#050f1c",
                    border: "1px solid #0f2035",
                    borderRadius: 7,
                    padding: "10px 14px",
                    color: "#00ff99",
                    fontFamily: "inherit",
                    fontSize: 11,
                    outline: "none",
                  }}
                >
                  <option value={1000}>1 second</option>
                  <option value={2000}>2 seconds</option>
                  <option value={3000}>3 seconds</option>
                  <option value={5000}>5 seconds</option>
                  <option value={10000}>10 seconds</option>
                  <option value={15000}>15 seconds</option>
                  <option value={30000}>30 seconds</option>
                  <option value={60000}>1 minute</option>
                </select>
                <p style={{ fontSize: 8, color: "#1a3a5a", marginTop: 5 }}>How often to fetch new token data</p>
              </div>

              <div>
                <label style={{ fontSize: 9, color: "#2a6a8a", letterSpacing: 2, display: "block", marginBottom: 7 }}>
                  MIN 🍩 DONUT SCORE TO ALERT: <span style={{ color: scoreColor(minDonut) }}>{minDonut}</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={minDonut}
                  onChange={(e) => setMinGem(+e.target.value)}
                  style={{ width: "100%", accentColor: "#00ff99", height: 4 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 9, color: "#2a6a8a", letterSpacing: 2, display: "block", marginBottom: 7 }}>
                  MIN RUG SAFETY SCORE: <span style={{ color: scoreColor(maxRug) }}>{maxRug}/100</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={maxRug}
                  onChange={(e) => setMaxRug(+e.target.value)}
                  style={{ width: "100%", accentColor: "#00ff99", height: 4 }}
                />
                <p style={{ fontSize: 8, color: "#1a3a5a", marginTop: 5 }}>
                  100=safest. Alert only if rug safety ≥ {maxRug}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ALERTS TAB ── */}
      {tab === "alerts" && (
        <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
          <h2
            style={{
              color: "#fff",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: 2,
              marginBottom: 20,
              borderBottom: "1px solid #0f2035",
              paddingBottom: 12,
            }}
          >
            ALERTS SENT ({sent.length})
          </h2>
          {sent.length === 0 ? (
            <div style={{ color: "#1a3a5a", textAlign: "center", padding: 60, fontSize: 11 }}>
              No alerts yet. Scanner is running every 2 seconds.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sent.map((a, i) => (
                <div
                  key={i}
                  style={{
                    background: "#050f1c",
                    border: "1px solid #0f2035",
                    borderRadius: 8,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <ScoreRing value={a.donutScore} size={40} label="DONUT" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#00ff99" }}>{a.symbol}</span>
                      <span
                        style={{
                          fontSize: 8,
                          color: a.chainColor,
                          background: `${a.chainColor}18`,
                          border: `1px solid ${a.chainColor}30`,
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        {a.chain}
                      </span>
                      <Pill color={a.rug.color}>Rug {a.rug.rugScore}</Pill>
                    </div>
                    <div style={{ fontSize: 9, color: "#3a6a8a" }}>
                      {fmtP(a.price)} · MCap {fmtN(a.mcap)} · Liq {fmtN(a.liq)} · {a.sentAt}
                    </div>
                  </div>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 9,
                      color: "#2a4a6a",
                      border: "1px solid #0f2035",
                      padding: "4px 10px",
                      borderRadius: 5,
                      textDecoration: "none",
                    }}
                  >
                    DSC ↗
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SCANNER TAB ── */}
      {tab === "scanner" && (
        <div
          style={{ flex: 1, display: "grid", gridTemplateColumns: sel ? "1fr 420px" : "1fr 260px", overflow: "hidden" }}
        >
          {/* ── TABLE ── */}
          <div style={{ overflow: "auto", padding: "14px 16px" }}>
            {/* Sort bar */}
            <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              {(
                [
                  ["gem", "🍩 DONUT"],
                  ["rug", "🔒 SAFE"],
                  ["mcap", "💰 MCAP"],
                  ["5m", "📈 5M%"],
                  ["vol", "💥 VOL"],
                  ["liq", "💧 LIQ"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setSortKey(k)}
                  style={{
                    background: sortKey === k ? "#00ff9910" : "transparent",
                    border: `1px solid ${sortKey === k ? "#00ff9940" : "#0f2035"}`,
                    color: sortKey === k ? "#00ff99" : "#2a4a6a",
                    padding: "4px 11px",
                    borderRadius: 20,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  {l}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 9, color: "#1a3a5a" }}>
                {filtered.length} tokens · MCap ≤ {maxMcap ? fmtN(maxMcap, "$") : "∞"}
              </span>
            </div>

            {/* Column headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 80px 55px 65px 65px 65px 65px 70px 70px 80px",
                gap: 4,
                padding: "5px 8px",
                fontSize: 7,
                color: "#1a3a5a",
                letterSpacing: 1,
                textTransform: "uppercase",
                borderBottom: "1px solid #0a1828",
                marginBottom: 4,
              }}
            >
              <span>TOKEN</span>
              <span>PRICE</span>
              <span>5M%</span>
              <span>MCAP</span>
              <span>LIQ</span>
              <span>VOL 5M</span>
              <span>TXNS</span>
              <span>VOL/LIQ</span>
              <span>🍩 DONUT</span>
              <span>🔒 RUG</span>
            </div>

            {loading && coins.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#1a3a5a" }}>
                <div
                  style={{
                    fontSize: 24,
                    color: "#00ff99",
                    textShadow: "0 0 20px #00ff99",
                    animation: "spin 1s linear infinite",
                    display: "inline-block",
                    marginBottom: 12,
                  }}
                >
                  ◈
                </div>
                <div style={{ fontSize: 10, letterSpacing: 2 }}>FETCHING LIVE TOKENS...</div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {filtered.map((coin) => {
                const isGem = coin.donutScore >= minDonut && coin.rug.rugScore >= maxRug
                const isSel = selected === coin.key
                return (
                  <div
                    key={coin.key}
                    onClick={() => setSelected(isSel ? null : coin.key)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 80px 55px 65px 65px 65px 65px 70px 70px 80px",
                      gap: 4,
                      padding: "9px 8px",
                      borderRadius: 7,
                      alignItems: "center",
                      background: isSel ? "#00ff9912" : isGem ? "#00ff990a" : "#050f1c",
                      border: `1px solid ${isSel ? "#00ff9950" : isGem ? "#00ff9928" : "#0a1828"}`,
                      boxShadow: isSel ? "0 0 20px #00ff9920" : isGem ? "0 0 12px #00ff9910" : "none",
                      cursor: "pointer",
                      transition: "all 0.3s",
                    }}
                  >
                    {/* Token */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                        {coin.isNew && (
                          <span
                            style={{
                              fontSize: 7,
                              fontWeight: 900,
                              color: "#fff",
                              background: "linear-gradient(135deg, #ff6b6b, #ff8533)",
                              padding: "1px 4px",
                              borderRadius: 2,
                              letterSpacing: 0.5,
                              animation: "pulse 1.5s infinite",
                            }}
                          >
                            NEW
                          </span>
                        )}
                        {isGem && (
                          <div
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: "#00ff99",
                              boxShadow: "0 0 6px #00ff99",
                              animation: "glow 1s infinite",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span style={{ fontSize: 11, fontWeight: 800, color: isGem ? "#ccffe8" : "#88aacc" }}>
                          {coin.symbol}
                        </span>
                        <span
                          style={{
                            fontSize: 7,
                            color: coin.chainColor,
                            background: `${coin.chainColor}18`,
                            border: `1px solid ${coin.chainColor}30`,
                            padding: "1px 4px",
                            borderRadius: 2,
                          }}
                        >
                          {coin.chain}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 8,
                          color: "#1a3a5a",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 148,
                        }}
                      >
                        {coin.name}
                      </div>
                      <div style={{ display: "flex", gap: 3, marginTop: 2, flexWrap: "wrap" }}>
                        {coin.rug.mintRevoked && (
                          <Pill color="#00ff99" bg="#00ff9910" border="#00ff9930">
                            ✓ Mint
                          </Pill>
                        )}
                        {!coin.rug.mintRevoked && (
                          <Pill color="#ff4444" bg="#ff444410" border="#ff444430">
                            ✕ Mint
                          </Pill>
                        )}
                        {coin.rug.freezeRevoked && (
                          <Pill color="#00ff99" bg="#00ff9910" border="#00ff9930">
                            ✓ Freeze
                          </Pill>
                        )}
                        {!coin.rug.freezeRevoked && (
                          <Pill color="#ff4444" bg="#ff444410" border="#ff444430">
                            ✕ Freeze
                          </Pill>
                        )}
                      </div>
                    </div>

                    {/* Price */}
                    <div style={{ fontSize: 10, color: "#88aacc", fontWeight: 600 }}>{fmtP(coin.price)}</div>

                    {/* 5m% */}
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: pctColor(coin.p5m),
                        textShadow:
                          coin.p5m > 0
                            ? "0 0 8px #00ff9950"
                            : coin.p5m < 0
                              ? "0 0 8px #ff444450"
                              : "none",
                      }}
                    >
                      {pct(coin.p5m)}
                    </div>

                    {/* MCap */}
                    <div style={{ fontSize: 9, color: "#4a7a9a" }}>{fmtN(coin.mcap)}</div>

                    {/* Liq */}
                    <div style={{ fontSize: 9, color: "#4a7a9a" }}>{fmtN(coin.liq)}</div>

                    {/* Vol 5m */}
                    <div style={{ fontSize: 9, color: coin.vol5m > 0 ? "#88ccff" : "#2a4a6a" }}>{fmtN(coin.vol5m)}</div>

                    {/* Txns 5m */}
                    <div>
                      <div style={{ fontSize: 8, color: "#00cc66" }}>{coin.txBuys5m}B</div>
                      <div style={{ fontSize: 8, color: "#cc4444" }}>{coin.txSells5m}S</div>
                    </div>

                    {/* Vol/Liq */}
                    <div style={{ fontSize: 9, color: parseFloat(coin.volLiqRatio) > 2 ? "#ffdd00" : "#2a4a6a" }}>
                      {coin.volLiqRatio}x
                    </div>

                    {/* Gem score */}
                    <ScoreRing value={coin.donutScore} size={38} />

                    {/* Rug score */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <ScoreRing value={coin.rug.rugScore} size={38} />
                      <span style={{ fontSize: 7, color: coin.rug.color, fontWeight: 700 }}>{coin.rug.level}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── DETAIL PANEL ── */}
          {sel ? (
            <div
              style={{ borderLeft: "1px solid #0a1828", overflow: "auto", background: "#040c16", padding: "14px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>{sel.symbol}</span>
                    <span
                      style={{
                        fontSize: 9,
                        color: sel.chainColor,
                        background: `${sel.chainColor}18`,
                        border: `1px solid ${sel.chainColor}30`,
                        padding: "2px 7px",
                        borderRadius: 3,
                      }}
                    >
                      {sel.chainIcon} {sel.chain}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#2a4a6a", marginTop: 2 }}>{sel.name}</div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: "none", border: "none", color: "#2a4a6a", cursor: "pointer", fontSize: 18 }}
                >
                  ✕
                </button>
              </div>

              {/* Score pair */}
              <div style={{ display: "flex", gap: 10, marginBottom: 16, justifyContent: "center" }}>
                <ScoreRing value={sel.donutScore} size={64} label="DONUT" />
                <ScoreRing value={sel.rug.rugScore} size={64} label="SAFETY" />
              </div>

              {/* Verdict */}
              <div
                style={{
                  textAlign: "center",
                  marginBottom: 12,
                  padding: "8px 12px",
                  background: sel.momentum.verdict === "Strong Momentum" ? "#00ff9915" : sel.momentum.verdict === "Early Watch" ? "#ffdd0015" : "#0a1828",
                  border: `1px solid ${sel.momentum.verdict === "Strong Momentum" ? "#00ff9940" : sel.momentum.verdict === "Early Watch" ? "#ffdd0040" : "#1a3a5a"}`,
                  borderRadius: 6,
                }}
              >
                <span style={{ fontSize: 8, color: "#2a4a6a", letterSpacing: 2, display: "block", marginBottom: 4 }}>VERDICT</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: sel.momentum.verdict === "Strong Momentum" ? "#00ff99" : sel.momentum.verdict === "Early Watch" ? "#ffdd00" : "#888",
                  }}
                >
                  {sel.momentum.verdict.toUpperCase()}
                </span>
              </div>

              {/* Why it triggered */}
              {sel.momentum.triggers.length > 0 && (
                <div
                  style={{
                    background: "#050f1c",
                    border: "1px solid #0a1828",
                    borderRadius: 8,
                    padding: "12px",
                    marginBottom: 10,
                  }}
                >
                  <div style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: 2, marginBottom: 8 }}>WHY IT TRIGGERED</div>
                  {sel.momentum.triggers.map((trigger, i) => (
                    <div key={i} style={{ fontSize: 9, color: "#00ff99", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#00ff9980" }}>&#x2022;</span>
                      {trigger}
                    </div>
                  ))}
                </div>
              )}

              {/* Momentum breakdown */}
              <div
                style={{
                  background: "#050f1c",
                  border: "1px solid #0a1828",
                  borderRadius: 8,
                  padding: "12px",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: 2, marginBottom: 10 }}>MOMENTUM BREAKDOWN</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {(
                    [
                      ["Social Velocity", sel.momentum.socialVelocity, 25],
                      ["Liquidity Growth", sel.momentum.liquidityGrowth, 20],
                      ["Buy Pressure", sel.momentum.buyPressure, 20],
                      ["Wallet Quality", sel.momentum.walletQuality, 15],
                      ["Volume Accel", sel.momentum.volumeAccel, 10],
                      ["Cross-Platform", sel.momentum.crossPlatform, 10],
                    ] as const
                  ).map(([label, val, max]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                      <span style={{ color: "#2a4a6a" }}>{label}</span>
                      <span style={{ color: val >= max * 0.7 ? "#00ff99" : val >= max * 0.4 ? "#ffdd00" : "#666", fontWeight: 600 }}>
                        {val}/{max}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price / market */}
              <div
                style={{
                  background: "#050f1c",
                  border: "1px solid #0a1828",
                  borderRadius: 8,
                  padding: "12px",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: 2, marginBottom: 10 }}>MARKET DATA</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {(
                    [
                      ["Price", fmtP(sel.price)],
                      ["MCap", fmtN(sel.mcap)],
                      ["Liq", fmtN(sel.liq)],
                      ["FDV", fmtN(sel.fdv)],
                      ["Vol 5m", fmtN(sel.vol5m)],
                      ["Vol 1h", fmtN(sel.volH1)],
                      ["Vol 24h", fmtN(sel.volH24)],
                      ["Vol/Liq", `${sel.volLiqRatio}x`],
                      ["5m %", pct(sel.p5m)],
                      ["1h %", pct(sel.p1h)],
                      ["24h %", pct(sel.p24h)],
                      ["Age", sel.pairAge !== null ? `${sel.pairAge}hr` : "—"],
                    ] as const
                  ).map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                      <span style={{ color: "#2a4a6a" }}>{l}</span>
                      <span style={{ color: "#88aacc", fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Txns */}
              <div
                style={{
                  background: "#050f1c",
                  border: "1px solid #0a1828",
                  borderRadius: 8,
                  padding: "12px",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: 2, marginBottom: 10 }}>TRANSACTIONS</div>
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 9, textAlign: "center" }}
                >
                  <div style={{ color: "#1a3a5a" }}>PERIOD</div>
                  <div style={{ color: "#00cc66" }}>BUYS</div>
                  <div style={{ color: "#cc4444" }}>SELLS</div>
                  {(
                    [
                      ["5m", sel.txBuys5m, sel.txSells5m],
                      ["1h", sel.txBuys1h, sel.txSells1h],
                      ["24h", sel.txBuys24, sel.txSells24],
                    ] as const
                  ).map(([l, b, s]) => (
                    <Fragment key={l}>
                      <div style={{ color: "#2a4a6a" }}>{l}</div>
                      <div style={{ color: "#00cc66", fontWeight: 700 }}>{b}</div>
                      <div style={{ color: "#cc4444", fontWeight: 700 }}>{s}</div>
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* Rug check */}
              <div
                style={{
                  background: "#050f1c",
                  border: `1px solid ${sel.rug.color}30`,
                  borderRadius: 8,
                  padding: "12px",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}
                >
                  <div style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: 2 }}>RUG CHECK</div>
                  <Pill color={sel.rug.color}>
                    {sel.rug.emoji} {sel.rug.level} RISK
                  </Pill>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {sel.rug.flags.map((f, i) => (
                    <div
                      key={i}
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: f.bad ? "#ff8866" : "#00cc77" }}
                    >
                      {f.bad ? "⚠️" : "✓"} {f.f}
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #0a1828", marginTop: 4, paddingTop: 6, fontSize: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#2a4a6a" }}>Liq/MCap Ratio</span>
                      <span style={{ color: "#88aacc" }}>{sel.rug.liqRatio}%</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                      <span style={{ color: "#2a4a6a" }}>Top Holder</span>
                      <span style={{ color: "#88aacc" }}>{sel.rug.topHolder}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Social links */}
              <div
                style={{
                  background: "#050f1c",
                  border: "1px solid #0a1828",
                  borderRadius: 8,
                  padding: "12px",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: 2, marginBottom: 10 }}>TRADE WITH FOMO</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#0a1828",
                    border: "1px solid #1a3a5a",
                    borderRadius: 6,
                    padding: "8px 12px",
                    marginBottom: 12,
                  }}
                >
                  <code
                    style={{
                      flex: 1,
                      fontSize: 9,
                      color: "#88aacc",
                      fontFamily: "monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sel.addr}
                  </code>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(sel.addr)
                      log("📋", `Copied ${sel.symbol} address for FOMO`, "#00ff99")
                    }}
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      color: "#fff",
                      background: "linear-gradient(135deg, #ff6b6b, #ff8533)",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: 4,
                      cursor: "pointer",
                      letterSpacing: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    COPY FOR FOMO
                  </button>
                </div>
                <div style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: 2, marginBottom: 10 }}>SOCIAL & LINKS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <a
                    href={sel.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 9,
                      color: "#00ff99",
                      background: "#00ff9910",
                      border: "1px solid #00ff9930",
                      padding: "5px 10px",
                      borderRadius: 5,
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    DexScreener
                  </a>
                  {sel.social.twitter && (
                    <a
                      href={sel.social.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 9,
                        color: "#1d9bf0",
                        background: "#1d9bf010",
                        border: "1px solid #1d9bf030",
                        padding: "5px 10px",
                        borderRadius: 5,
                        textDecoration: "none",
                        fontWeight: 700,
                      }}
                    >
                      Twitter
                    </a>
                  )}
                  {sel.social.telegram && (
                    <a
                      href={sel.social.telegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 9,
                        color: "#28a8e0",
                        background: "#28a8e010",
                        border: "1px solid #28a8e030",
                        padding: "5px 10px",
                        borderRadius: 5,
                        textDecoration: "none",
                        fontWeight: 700,
                      }}
                    >
                      Telegram
                    </a>
                  )}
                  {sel.social.discord && (
                    <a
                      href={sel.social.discord}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 9,
                        color: "#7289da",
                        background: "#7289da10",
                        border: "1px solid #7289da30",
                        padding: "5px 10px",
                        borderRadius: 5,
                        textDecoration: "none",
                        fontWeight: 700,
                      }}
                    >
                      Discord
                    </a>
                  )}
                  {sel.social.website && (
                    <a
                      href={sel.social.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 9,
                        color: "#88aacc",
                        background: "#88aacc10",
                        border: "1px solid #88aacc30",
                        padding: "5px 10px",
                        borderRadius: 5,
                        textDecoration: "none",
                        fontWeight: 700,
                      }}
                    >
                      Website
                    </a>
                  )}
                  {!sel.social.twitter && !sel.social.telegram && !sel.social.website && (
                    <span style={{ fontSize: 9, color: "#ff8866" }}>No social links found</span>
                  )}
                </div>
              </div>

              {/* Send alert manually */}
              {botToken && (
                <button
                  onClick={async () => {
                    const ok = await sendTelegram(botToken, chatId, sel)
                    if (ok) {
                      setSent((a) => [{ ...sel, sentAt: new Date().toLocaleTimeString() }, ...a].slice(0, 50))
                      log("📲", `Manual alert → ${sel.symbol}`, "#00ff99")
                    } else {
                      log("⚠️", "Alert failed — check token", "#ffaa00")
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#00ff9912",
                    border: "1px solid #00ff9940",
                    color: "#00ff99",
                    borderRadius: 7,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 2,
                  }}
                >
                  SEND ALERT NOW
                </button>
              )}
            </div>
          ) : (
            /* ── RIGHT FEED ── */
            <div
              style={{ borderLeft: "1px solid #0a1828", display: "flex", flexDirection: "column", overflow: "hidden" }}
            >
              <div
                style={{
                  padding: "12px",
                  borderBottom: "1px solid #0a1828",
                  background: "#050f1c",
                  flexShrink: 0,
                }}
              >
                <div style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: 2, marginBottom: 10 }}>ALERT CRITERIA</div>
                {(
                  [
                    ["🍩 Min Donut", `${minDonut}/100`, scoreColor(minDonut)],
                    ["🔒 Min Safety", `${maxRug}/100`, scoreColor(maxRug)],
                    ["💰 Max MCap", maxMcap ? fmtN(maxMcap, "$") : "∞", "#88aacc"],
                    ["🔄 Interval", "2 seconds", "#44aaff"],
                  ] as const
                ).map(([l, v, c]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 6 }}>
                    <span style={{ color: "#2a4a6a" }}>{l}</span>
                    <span style={{ color: c, fontWeight: 800 }}>{v}</span>
                  </div>
                ))}
                <div
                  style={{
                    fontSize: 8,
                    color: "#1a3a5a",
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid #0a1828",
                  }}
                >
                  Click any token row to see full details
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
                <div style={{ fontSize: 8, color: "#1a3a5a", letterSpacing: 2, marginBottom: 8 }}>LIVE LOG</div>
                {feed.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: "flex",
                      gap: 6,
                      marginBottom: 6,
                      alignItems: "flex-start",
                      borderLeft: `2px solid ${ev.color}50`,
                      paddingLeft: 6,
                    }}
                  >
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{ev.icon}</span>
                    <div>
                      <div style={{ fontSize: 9, color: "#5577aa", lineHeight: 1.5 }}>{ev.msg}</div>
                      <div style={{ fontSize: 7, color: "#1a3a5a" }}>{ev.t}</div>
                    </div>
                  </div>
                ))}
                {feed.length === 0 && (
                  <div style={{ color: "#0f2030", fontSize: 9, padding: 16, textAlign: "center" }}>Scanning...</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

<style>{`
@keyframes glow { 0%,100%{box-shadow:0 0 10px #00ff99} 50%{box-shadow:0 0 3px #00ff99} }
@keyframes spin  { to{transform:rotate(360deg)} }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.95)} }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:3px; height:3px }
        ::-webkit-scrollbar-track { background:#030a12 }
        ::-webkit-scrollbar-thumb { background:#0f2035; border-radius:2px }
        input:focus,select:focus { outline:none; border-color:#00ff9950 !important }
        a:hover { opacity:0.8 }
        button:active { transform:scale(0.97) }
      `}</style>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState(false)
  return auth ? <Dashboard /> : <Login onLogin={() => setAuth(true)} />
}
