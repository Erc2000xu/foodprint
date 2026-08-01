"use client";

import { useState } from "react";
import { BowlIcon, toBowlLevel } from "@/components/recommendation/bowl-icon";
import { GoodAtIcon, goodAtOptions, type GoodAtSlug } from "@/components/recommendation/good-at-icon";

const strengths = [
  { value: 1, label: "值得去", description: "在附近，会放心推荐" },
  { value: 2, label: "想再去", description: "吃过还惦记，愿意再来" },
  { value: 3, label: "会专门去", description: "值得特意安排一趟" },
];

const maxGoodAtTags = 4;

export function OpinionPicker({ namePrefix, defaultStrength, defaultTags = [] }: { namePrefix: "tags" | "opinion_tags"; defaultStrength?: number; defaultTags?: string[] }) {
  const [selected, setSelected] = useState<GoodAtSlug[]>(defaultTags.filter((tag): tag is GoodAtSlug => goodAtOptions.some((item) => item.slug === tag)));
  const toggle = (slug: GoodAtSlug) => setSelected((current) => current.includes(slug) ? current.filter((item) => item !== slug) : current.length < maxGoodAtTags ? [...current, slug] : current);
  return <>
    <fieldset className="meal-strength opinion-picker__strength">
      <legend>这次的推荐强度 <span className="required-dot" aria-label="必填">·</span></legend>
      <div className="strength-choice-list">{strengths.map((strength) => <label className="strength-choice" key={strength.value}>
        <input defaultChecked={defaultStrength === strength.value} name="strength" required type="radio" value={strength.value} />
        <span className="strength-choice__content"><BowlIcon level={toBowlLevel(strength.value)} size="sm" /><span><b>{strength.label}</b><small>{strength.description}</small></span><em aria-hidden="true">✓</em></span>
      </label>)}</div>
    </fieldset>
    <fieldset className="scene-tag-picker opinion-picker__tags">
      <legend>好在哪儿 <span className="required-dot" aria-label="必填">·</span><small>已选 {selected.length}/{maxGoodAtTags}</small></legend>
      {selected.map((slug) => <input key={`selected-${slug}`} name={namePrefix} type="hidden" value={slug} />)}
      <div className="good-at-picker">{goodAtOptions.map((option) => {
        const checked = selected.includes(option.slug); const disabled = !checked && selected.length >= maxGoodAtTags;
        return <label className={`good-at-choice${checked ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`} key={option.slug}>
          {/* The hidden inputs above are the canonical submitted values. The
              visible controls use a separate name so React-controlled
              checkbox state cannot be lost during mobile form submission. */}
          <input checked={checked} disabled={disabled} name={`${namePrefix}__ui`} onChange={() => toggle(option.slug)} required={selected.length === 0 && option.slug === goodAtOptions[0].slug} type="checkbox" value={option.slug} />
          <GoodAtIcon slug={option.slug} size={56} /><span><b>{option.label}</b><small>{option.description}</small></span><em aria-hidden="true">✓</em>
        </label>;
      })}</div>
    </fieldset>
  </>;
}
