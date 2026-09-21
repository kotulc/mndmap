import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
/** One stylesheet, and it carries the ramp, the card table and React Flow's
 *  own sheet with it. mndmap adds only its own shell over the top, so what a
 *  card looks like here is what it looks like in mndflow. */
import "@mnd/kit/react.css";
import "./base.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Dashboard root element is missing");

createRoot(root).render(<StrictMode><App /></StrictMode>);
