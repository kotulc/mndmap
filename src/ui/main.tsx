import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "@mnd/kit/react.css";
import "./theme.css";
import "./base.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Dashboard root element is missing");

createRoot(root).render(<StrictMode><App /></StrictMode>);
