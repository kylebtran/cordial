import { SearchIcon } from "lucide-react";
import React from "react";

export function Searchbar({
  search,
  setSearch,
}: {
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <form onSubmit={() => {}} className="w-full">
      <div className="flex items-center gap-2 px-2 text-[12px] font-medium bg-outline/40 rounded h-8 focus-within:ring-1 border border-outline">
        <SearchIcon strokeWidth={1.5} width={16} height={16} />
        <input
          type="text"
          placeholder="Search chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent placeholder:opacity/70 focus:outline-none"
        ></input>
      </div>
    </form>
  );
}
