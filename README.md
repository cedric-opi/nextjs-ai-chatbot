# Project Financial Advisor

## ✨ Features

* **Next.js App Router**

  * Advanced routing for seamless navigation and performance
  * React Server Components (RSCs) and Server Actions for server-side rendering and increased performance

* **AI SDK**

  * Unified API for generating text, structured objects, and tool calls with LLMs
  * Hooks for building dynamic chat and generative user interfaces
  * Supports xAI (default), OpenAI, Fireworks, and other model providers

* **shadcn/ui**

  * Styling powered by Tailwind CSS
  * Component primitives from Radix UI for accessibility and flexibility

* **Data Persistence**

  * Supabase Serverless Postgres for saving chat history and user data
  * Vercel Blob for efficient file storage

* **Auth.js**

  * Simple and secure authentication

## 🤖 Model Providers

This template uses the **Vercel AI Gateway** to access multiple AI models through a unified interface.
Default configuration includes:

* `grok-2-vision-1212`
* `grok-3-mini`

### AI Gateway Authentication

For non-Vercel deployments, set the environment variable in `.env.local`:

```
AI_GATEWAY_API_KEY=your_key_here
```

---

# 🛠️ Installation & Execution Guide (macOS & Windows)

## **Prerequisites**

Ensure the following are installed:

* Node.js (v18+)
* pnpm package manager
* Vercel CLI
* Git (optional but recommended)

Install pnpm:

```
npm install -g pnpm
```

Install Vercel CLI:

```
npm install -g vercel
```

---

## 📥 1. Clone the Repository

```
git clone <your-repository-url>
cd <your-project-folder>
```

---

## ⚙️ 2. Configure Environment Variables

Copy environment example:

```
cp .env.example .env.local
```

Fill in required secrets for:

* Supabase
* AI Gateway
* Authentication
* Database
* Blob storage

If using Vercel:

```
vercel link
vercel env pull
```

---

# 🍎 macOS Setup

### Install dependencies

```
pnpm install
```

### Run the dev server

```
pnpm dev
```

Your app runs at: [http://localhost:3000](http://localhost:3000)

### Optional macOS permission fixes

```
sudo chown -R $USER:$GROUP ~/.npm
sudo chown -R $USER:$GROUP ~/.pnpm-store
```

---

# 🪟 Windows Setup

### Install dependencies

```
pnpm install
```

If you encounter symlink issues, enable Developer Mode:
**Settings → Privacy & Security → For Developers → Developer Mode**

### Run the dev server

```
pnpm dev
```

Access the app at: [http://localhost:3000](http://localhost:3000)

### (Optional) WSL2 Setup

For better performance:

1. Install WSL2
2. Install Ubuntu
3. Run the project inside the Linux environment

---

# 📦 Production Build

```
pnpm build
pnpm start
```

---

# 🚀 Deploy to Vercel

```
vercel
```

---
