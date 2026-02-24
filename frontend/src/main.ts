import { createApp } from "vue";
import { MotionPlugin } from "@vueuse/motion";
import App from "./App.vue";
import "./style.css";

// Apply theme immediately before mount to prevent flash
try {
  const savedTheme = localStorage.getItem("worktime:theme");
  if (savedTheme && savedTheme !== "default") {
    document.documentElement.setAttribute("data-theme", savedTheme);
  }
} catch (e) {
  // ignore
}

const app = createApp(App);
app.use(MotionPlugin);
app.mount("#app");

