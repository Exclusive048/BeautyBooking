"use client";

import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useRef, type Ref, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AddressStatus, AddressSuggestion } from "@/lib/maps/use-address-with-geocode";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  telegram: string;
  instagram: string;
  vk: string;
  addressInputRef: Ref<HTMLInputElement>;
  addressStatus?: AddressStatus | null;
  addressSuggestions: AddressSuggestion[];
  isAddressSuggestOpen: boolean;
  setIsAddressSuggestOpen: (open: boolean) => void;
  selectAddressSuggestion: (item: AddressSuggestion) => void;
  addressSuggestIndex: number;
  setAddressSuggestIndex: (value: number) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onTelegramChange: (value: string) => void;
  onInstagramChange: (value: string) => void;
  onVkChange: (value: string) => void;
};

const inputClass =
  "border border-white/10 bg-white/6 focus-visible:border-white/20 focus-visible:ring-0";

export function StudioProfileForm({
  name,
  description,
  address,
  phone,
  email,
  telegram,
  instagram,
  vk,
  addressInputRef,
  addressStatus,
  addressSuggestions,
  isAddressSuggestOpen,
  setIsAddressSuggestOpen,
  selectAddressSuggestion,
  addressSuggestIndex,
  setAddressSuggestIndex,
  onNameChange,
  onDescriptionChange,
  onAddressChange,
  onPhoneChange,
  onEmailChange,
  onTelegramChange,
  onInstagramChange,
  onVkChange,
}: Props) {
  const studioFormText = UI_TEXT.studio.profileForm;
  const addressStatusTone =
    addressStatus?.tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : addressStatus?.tone === "error"
        ? "text-red-600 dark:text-red-400"
        : "text-text-sec";

  const addressSuggestRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isAddressSuggestOpen) return;
    const handleDocumentClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!addressSuggestRootRef.current) return;
      if (!addressSuggestRootRef.current.contains(target)) {
        setIsAddressSuggestOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("touchstart", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("touchstart", handleDocumentClick);
    };
  }, [isAddressSuggestOpen, setIsAddressSuggestOpen]);

  const handleAddressKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (addressSuggestions.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!isAddressSuggestOpen) {
          setIsAddressSuggestOpen(true);
          setAddressSuggestIndex(0);
          return;
        }
        const nextIndex =
          addressSuggestIndex < addressSuggestions.length - 1
            ? addressSuggestIndex + 1
            : 0;
        setAddressSuggestIndex(nextIndex);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!isAddressSuggestOpen) {
          setIsAddressSuggestOpen(true);
          setAddressSuggestIndex(addressSuggestions.length - 1);
          return;
        }
        const nextIndex =
          addressSuggestIndex <= 0
            ? addressSuggestions.length - 1
            : addressSuggestIndex - 1;
        setAddressSuggestIndex(nextIndex);
        return;
      }

      if (event.key === "Enter" && isAddressSuggestOpen) {
        if (
          addressSuggestIndex >= 0 &&
          addressSuggestIndex < addressSuggestions.length
        ) {
          event.preventDefault();
          selectAddressSuggestion(addressSuggestions[addressSuggestIndex]);
        }
        return;
      }

      if (event.key === "Escape" && isAddressSuggestOpen) {
        setIsAddressSuggestOpen(false);
        return;
      }
    },
    [
      addressSuggestions,
      addressSuggestIndex,
      isAddressSuggestOpen,
      selectAddressSuggestion,
      setAddressSuggestIndex,
      setIsAddressSuggestOpen,
    ]
  );

  return (
    <section className="lux-card rounded-[24px] p-5 md:p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">{studioFormText.nameLabel}</div>
            <Input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={studioFormText.namePlaceholder}
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">{studioFormText.descriptionLabel}</div>
            <div className="relative">
              <Textarea
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value.slice(0, 500))}
                placeholder={studioFormText.descriptionPlaceholder}
                maxLength={500}
                rows={4}
                className={`${inputClass} resize-none pb-7`}
              />
              <span className="absolute bottom-2 right-3 text-xs text-text-sec">{description.length}/500</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">{studioFormText.addressLabel}</div>
            <div ref={addressSuggestRootRef} className="relative">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center">
                  <MapPin className="h-4 w-4 text-text-sec" />
                </div>
                <input
                  ref={addressInputRef}
                  type="text"
                  value={address}
                  onChange={(event) => onAddressChange(event.target.value)}
                  onKeyDown={handleAddressKeyDown}
                  onFocus={() => {
                    if (addressSuggestions.length > 0) {
                      setIsAddressSuggestOpen(true);
                    }
                  }}
                  onBlur={() => {
                    setIsAddressSuggestOpen(false);
                  }}
                  placeholder={studioFormText.addressPlaceholder}
                  className={`lux-input h-11 w-full rounded-2xl px-4 text-sm text-text-main placeholder:text-text-placeholder outline-none ${inputClass} pl-11`}
                />
                {isAddressSuggestOpen && addressSuggestions.length > 0 ? (
                  <div className="absolute z-30 mt-2 w-full rounded-2xl border border-border-subtle bg-bg-card p-2 shadow-card">
                    {addressSuggestions.map((item, index) => (
                      <Button
                        variant="ghost"
                        size="none"
                        key={`${item.value}-${index}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setAddressSuggestIndex(index)}
                        onClick={() => selectAddressSuggestion(item)}
                        className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm ${
                          index === addressSuggestIndex ? "bg-bg-input" : ""
                        }`}
                        aria-label={studioFormText.selectAddressAria.replace("{address}", item.value)}
                      >
                        <span className="whitespace-normal break-words">{item.value}</span>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              {addressStatus ? (
                <div className={`mt-1 text-xs ${addressStatusTone}`}>{addressStatus.text}</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-label">{studioFormText.phoneLabel}</div>
              <Input
                value={phone}
                onChange={(event) => onPhoneChange(event.target.value)}
                placeholder={studioFormText.phonePlaceholder}
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-label">{studioFormText.emailLabel}</div>
              <Input
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder={studioFormText.emailPlaceholder}
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-label">{studioFormText.telegramLabel}</div>
              <Input
                value={telegram}
                onChange={(event) => onTelegramChange(event.target.value)}
                placeholder={studioFormText.telegramPlaceholder}
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-label">{studioFormText.vkLabel}</div>
              <Input
                value={vk}
                onChange={(event) => onVkChange(event.target.value)}
                placeholder={studioFormText.vkPlaceholder}
                className={inputClass}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="text-xs font-medium text-text-label">{studioFormText.instagramLabel}</div>
              <Input
                value={instagram}
                onChange={(event) => onInstagramChange(event.target.value)}
                placeholder={studioFormText.instagramPlaceholder}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
