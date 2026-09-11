import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import Chili from "@/pages/Chili";
import NotFound from "@/pages/NotFound";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Subcon from "@/pages/Subcon";
import { Redirect, Route, Switch } from "wouter";
import { useAuth } from "./_core/hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

// Subcon is Dad's business only; everyone else is sent back to the overview.
function AdminOnlySubcon() {
  const { user } = useAuth();
  if (user && user.role !== "admin") return <Redirect to="/" />;
  return <Subcon />;
}

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/subcon"} component={AdminOnlySubcon} />
        <Route path={"/chili"} component={Chili} />
        <Route path={"/settings"} component={Settings} />
        <Route path={"/reports"} component={Reports} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
