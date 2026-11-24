import { installJsdomPolyfills } from '@cbrl/testing/vitest/jsdom'
import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// ResizeObserver, matchMedia, scrollIntoView and Pointer Capture for Radix under jsdom.
installJsdomPolyfills()
// The ledger UI tests drive Radix dialogs/selects end to end; under a loaded
// parallel run the default 1s for findBy/waitFor is too tight.
configure({ asyncUtilTimeout: 4000 })
