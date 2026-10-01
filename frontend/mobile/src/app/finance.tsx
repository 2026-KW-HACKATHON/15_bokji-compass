import FinanceScreen from "../features/finance/FinanceScreen";
import { useSession } from "../services/runtime";

export default function FinanceRoute() {
  const auth = useSession();
  // Changing accounts unmounts the old form, aborts requests, and erases financial memory.
  return <FinanceScreen key={`${auth.status}:${auth.user?.id || "guest"}`} />;
}
