import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Start as false on both the server and the client's first render so the
  // sidebar renders the same tree during SSR/hydration. Reading
  // window.innerWidth in the initializer would make the client's first
  // render depend on the viewport (e.g. a narrow preview pane) and
  // desync it from the server HTML, causing a hydration mismatch.
  const [isMobile, setIsMobile] = React.useState<boolean>(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
