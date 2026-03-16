/// <reference types="vite-plugin-pwa/react" />
declare module 'virtual:pwa-register/react' {
  import { Dispatch, SetStateAction } from 'react'
  import { RegisterSWOptions } from 'vite-plugin-pwa/types'

  export type { RegisterSWOptions }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needUpdate: [boolean, Dispatch<SetStateAction<boolean>>]
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>]
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  }
}
