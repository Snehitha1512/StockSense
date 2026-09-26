import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
        
        <p className="text-slate-600 mb-6 text-sm leading-relaxed">
          You do not have permission to access this resource. Warehouse and location configuration settings are reserved strictly for <strong>Inventory Managers</strong>.
        </p>

        <div className="p-3 bg-slate-100 rounded-lg text-xs text-slate-500 mb-6">
          If you require administrative privileges or warehouse re-assignment, please contact your systems administrator.
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
