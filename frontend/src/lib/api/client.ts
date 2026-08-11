import axios from "axios"

import { env } from "@/config/env"

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 20_000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
})
