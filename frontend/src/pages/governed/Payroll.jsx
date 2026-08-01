// Payroll.jsx — full payroll module: employee & salary master, monthly payroll
// processing with EPF/EPS/EDLI + ESI + PT + TDS computation, payslips, and a
// compliance centre that produces the EPFO ECR 2.0 file, ESIC monthly
// contribution file, challan workings and the PF/ESI statutory forms.
import React, { useCallback, useEffect, useState } from 'react';
import { Users, Calculator, ShieldCheck, BarChart3, Settings2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGovernance } from '@/hooks/useGovernance';
import EmployeeMaster from '@/components/payroll/EmployeeMaster';
import PayrollRun from '@/components/payroll/PayrollRun';
import ComplianceCenter from '@/components/payroll/ComplianceCenter';
import PayrollReports from '@/components/payroll/PayrollReports';
import PayrollSettings from '@/components/payroll/PayrollSettings';
import { listEmployees, listRuns, getSettings } from '@/lib/payroll/store';

const MODULE = 'people_matrix';
const PAGE = 'can_view_payroll';

export default function Payroll() {
  const { hasActionAccess } = useGovernance();
  const canEdit = hasActionAccess ? hasActionAccess(MODULE, PAGE, 'edit') : true;

  const [employees, setEmployees] = useState([]);
  const [runs, setRuns] = useState([]);
  const [settings, setSettings] = useState(getSettings());
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());

  const refresh = useCallback(() => {
    setEmployees(listEmployees());
    setRuns(listRuns());
    setSettings(getSettings());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Payroll</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Salary processing with EPF, EPS, EDLI, ESI, professional tax and TDS — including ready-to-upload
          ECR and ESIC return files.
        </p>
      </div>

      <Tabs defaultValue="run">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="employees"><Users className="w-4 h-4 mr-2" />Employees</TabsTrigger>
          <TabsTrigger value="run"><Calculator className="w-4 h-4 mr-2" />Process payroll</TabsTrigger>
          <TabsTrigger value="compliance"><ShieldCheck className="w-4 h-4 mr-2" />PF &amp; ESI returns</TabsTrigger>
          <TabsTrigger value="reports"><BarChart3 className="w-4 h-4 mr-2" />Reports</TabsTrigger>
          <TabsTrigger value="settings"><Settings2 className="w-4 h-4 mr-2" />Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="mt-4">
          <EmployeeMaster employees={employees} onChange={refresh} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="run" className="mt-4">
          <PayrollRun
            employees={employees}
            settings={settings}
            month={month}
            year={year}
            setMonth={setMonth}
            setYear={setYear}
            onSaved={refresh}
            canEdit={canEdit}
          />
        </TabsContent>

        <TabsContent value="compliance" className="mt-4">
          <ComplianceCenter runs={runs} employees={employees} settings={settings} />
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <PayrollReports runs={runs} employees={employees} settings={settings} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <PayrollSettings settings={settings} onChange={refresh} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
