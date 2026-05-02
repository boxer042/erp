import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

// 모바일 + 태블릿(터치 기기)을 모두 포함. 콤보박스 UI 분기에 사용.
export function useIsCompactDevice() {
  const [match, setMatch] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px), (pointer: coarse)")
    const onChange = () => setMatch(mql.matches)
    mql.addEventListener("change", onChange)
    setMatch(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!match
}
