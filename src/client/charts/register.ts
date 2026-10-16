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
import { applyChartDefaults } from "./factory";

applyChartDefaults(ChartJS);

function registerChart(...elements: Parameters<(typeof ChartJS)["register"]>[number][]): void {
  (ChartJS.register as (...args: unknown[]) => void)(...elements);
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
