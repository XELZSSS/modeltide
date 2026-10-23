import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  ArcElement,
  DoughnutController,
  PointElement,
  LineElement,
  LineController,
  Filler,
  RadialLinearScale,
  RadarController,
  Tooltip,
  Legend,
} from "chart.js";
import { applyChartDefaults } from "./theme";

applyChartDefaults(ChartJS);

function registerChart(...elements: Parameters<(typeof ChartJS)["register"]>[number][]): void {
  (ChartJS.register as (...args: unknown[]) => void)(...elements);
  // Re-apply after registering: plugin defaults (including the tooltip's) only exist once the plugin is registered.
  applyChartDefaults(ChartJS);
}

export function registerLine(): void {
  registerChart(LineController, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);
}
export function registerDoughnut(): void {
  registerChart(DoughnutController, ArcElement, Tooltip, Legend);
}
export function registerRadar(): void {
  registerChart(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);
}
