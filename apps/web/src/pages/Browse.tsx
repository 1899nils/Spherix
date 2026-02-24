export function Browse() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
      <div className="h-20 w-20 bg-blue-500/10 rounded-2xl flex items-center justify-center">
        <div className="h-10 w-10 text-blue-500">
           {/* Icon will be injected or used as component */}
           <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
        </div>
      </div>
      <h1 className="text-3xl font-bold text-white">Entdecken</h1>
      <p className="text-muted-foreground max-w-md">Hier findest du bald neue Musik, Trends und Empfehlungen.</p>
    </div>
  );
}
