import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchPlaceSuggestions, CURATED_PRESET_PLACES } from "../services/api";
import type { PlaceSuggestion } from "../types/airlane";

interface LocationAutocompleteInputProps {
  id?: string;
  label: string;
  tag: string;
  dotColor: string;
  value: string;
  onChange: (value: string) => void;
  onSelectPlace?: (place: PlaceSuggestion) => void;
  placeholder?: string;
  required?: boolean;
}

export const LocationAutocompleteInput: React.FC<LocationAutocompleteInputProps> = ({
  id,
  label,
  tag,
  dotColor,
  value,
  onChange,
  onSelectPlace,
  placeholder = "Search location, campus, or coordinates...",
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Perform suggestions lookup
  const loadSuggestions = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const results = await fetchPlaceSuggestions(query, 7);
      setSuggestions(results);
      setHighlightedIndex(-1);
    } catch {
      setSuggestions(CURATED_PRESET_PLACES.slice(0, 5));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounce input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      loadSuggestions(newValue);
    }, 220);
  };

  const handleFocus = () => {
    setIsOpen(true);
    if (suggestions.length === 0) {
      loadSuggestions(value);
    }
  };

  const handleSelect = (item: PlaceSuggestion) => {
    onChange(item.label);
    if (onSelectPlace) {
      onSelectPlace(item);
    }
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(true);
    loadSuggestions("");
    inputRef.current?.focus();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        loadSuggestions(value);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Category Icon Renderer
  const renderCategoryIcon = (category: PlaceSuggestion["category"]) => {
    switch (category) {
      case "airport":
        return (
          <div className="w-6 h-6 rounded bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
          </div>
        );
      case "infrastructure":
        return (
          <div className="w-6 h-6 rounded bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M7 2v11h3v9l7-12h-4l4-8z" />
            </svg>
          </div>
        );
      case "safe_zone":
        return (
          <div className="w-6 h-6 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
          </div>
        );
      case "campus":
        return (
          <div className="w-6 h-6 rounded bg-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM3.45 9L12 4.33 20.55 9 12 13.67 3.45 9zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
            </svg>
          </div>
        );
      case "coordinate":
        return (
          <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-6 h-6 rounded bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-3.5 h-3.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
        );
    }
  };

  const renderBadge = (item: PlaceSuggestion) => {
    if (!item.badge) return null;
    let badgeStyle = "bg-slate-100 text-slate-600 border-slate-200";

    if (item.category === "airport") {
      badgeStyle = "bg-purple-50 text-purple-700 border-purple-200";
    } else if (item.category === "infrastructure") {
      badgeStyle = "bg-amber-50 text-amber-700 border-amber-200";
    } else if (item.category === "safe_zone") {
      badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-200";
    } else if (item.category === "campus") {
      badgeStyle = "bg-sky-50 text-sky-700 border-sky-200";
    } else if (item.category === "coordinate") {
      badgeStyle = "bg-indigo-50 text-indigo-700 border-indigo-200";
    }

    return (
      <span
        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${badgeStyle}`}
      >
        {item.badge}
      </span>
    );
  };

  return (
    <div ref={containerRef} className="space-y-1 relative">
      {/* Field Label & Tag */}
      <label
        htmlFor={id}
        className="flex items-center justify-between text-xs font-bold text-slate-800"
      >
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          {label}
        </span>
        <span className="text-[10px] font-mono text-slate-400 font-normal">
          {tag}
        </span>
      </label>

      {/* Input Box with Action Buttons & Loader */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className="w-full pl-3 pr-16 py-2 text-xs sm:text-sm bg-slate-50/80 hover:bg-white border border-slate-200 hover:border-slate-300 focus:bg-white rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all font-sans"
        />

        <div className="absolute right-2 flex items-center gap-1.5 text-slate-400">
          {/* Loading Indicator */}
          {isLoading && (
            <div className="w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          )}

          {/* Clear Button */}
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:text-slate-700 rounded transition-colors text-slate-400"
              title="Clear input"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}

          {/* Search Icon */}
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Autocomplete Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Dropdown Header */}
          <div className="px-3 py-1.5 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              {value.trim() ? "Search Suggestions" : "Recommended Hubs & Landmarks"}
            </span>
            <span className="text-[9px] font-mono text-slate-400">
              Use ↑↓ + Enter
            </span>
          </div>

          {/* Suggestions List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 py-0.5">
            {suggestions.length > 0 ? (
              suggestions.map((item, index) => {
                const isSelected = index === highlightedIndex;
                return (
                  <button
                    key={`${item.label}-${index}`}
                    type="button"
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                      isSelected
                        ? "bg-sky-50/90 text-sky-950"
                        : "hover:bg-slate-50 text-slate-800"
                    }`}
                  >
                    {renderCategoryIcon(item.category)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {item.label}
                        </span>
                        {renderBadge(item)}
                      </div>
                      {item.secondary && (
                        <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                          {item.secondary}
                        </p>
                      )}
                      {item.lat && item.lng && (
                        <span className="text-[9px] font-mono text-slate-400 block mt-0.5">
                          {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center text-xs text-slate-500 font-mono">
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                    <span>Searching global airspace & landmarks...</span>
                  </div>
                ) : (
                  <span>No locations matched. You can still use raw address or (lat, lng).</span>
                )}
              </div>
            )}
          </div>

          {/* Dropdown Footer Tip */}
          <div className="px-3 py-1 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>Press Esc to dismiss</span>
            <span>OSM / FAA / Mireye Ground Grid</span>
          </div>
        </div>
      )}
    </div>
  );
};
