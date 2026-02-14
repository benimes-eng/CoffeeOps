import { Settings as SettingsIcon } from "lucide-react";

const SettingsPage = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">System configuration</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Farm Details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Farm Name</label>
              <input
                type="text"
                defaultValue="CoffeeOps Estate"
                className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Region</label>
              <input
                type="text"
                defaultValue="Central Kenya"
                className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Currency</label>
              <select className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option>KES - Kenyan Shilling</option>
                <option>USD - US Dollar</option>
                <option>EUR - Euro</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl p-6 card-shadow border border-border/50">
          <h3 className="font-serif text-lg mb-4">Drying Parameters</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Target Moisture (%)</label>
              <input
                type="number"
                defaultValue="11.5"
                className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-medium">Standard Drying Days</label>
              <input
                type="number"
                defaultValue="14"
                className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        <button className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
