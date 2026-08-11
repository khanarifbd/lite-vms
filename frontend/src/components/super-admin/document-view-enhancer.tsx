"use client"

import { useEffect } from "react"

const ENHANCED_ATTRIBUTE = "data-document-view-enhanced"

function enhanceDocumentLinks(root: ParentNode) {
  const links = root.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/api/documents?"][href*="download=1"]'
  )

  links.forEach((downloadLink) => {
    if (downloadLink.getAttribute(ENHANCED_ATTRIBUTE) === "true") return

    const href = new URL(downloadLink.href, window.location.origin)
    href.searchParams.delete("download")

    const viewLink = downloadLink.cloneNode(true) as HTMLAnchorElement
    viewLink.href = href.pathname + href.search
    viewLink.target = "_blank"
    viewLink.rel = "noopener noreferrer"
    viewLink.textContent = "View document"
    viewLink.setAttribute("aria-label", "View document in browser")

    downloadLink.setAttribute(ENHANCED_ATTRIBUTE, "true")
    downloadLink.textContent = "Download"

    const parent = downloadLink.parentElement
    if (!parent) return

    parent.classList.remove("w-full")
    const actions = document.createElement("div")
    actions.className = "mt-3 grid grid-cols-2 gap-2"
    parent.insertBefore(actions, downloadLink)
    actions.append(viewLink, downloadLink)
  })
}

export function DocumentViewEnhancer() {
  useEffect(() => {
    enhanceDocumentLinks(document)

    const observer = new MutationObserver(() => enhanceDocumentLinks(document))
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
