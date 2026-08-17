import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import { afterEach, expect } from "vitest";

expect.extend(matchers);

if (typeof window !== "undefined") window.scrollTo = (() => undefined) as typeof window.scrollTo;

afterEach(() => cleanup());
