import { useState } from "react";
import { CM_PER_INCH } from "@/core/config";
import { OUTPUT_DPI } from "@/features/poster/infrastructure/renderer/constants";
import { AddIcon } from "@/shared/ui/Icons";
import type { CustomTemplate, LayoutGroup } from "../domain/types";
import { slugifyTemplateSegment } from "../infrastructure/layoutRepository";

const NEW_SECTION_VALUE = "__new_section__";

interface CreateTemplateFormProps {
  layoutGroups: LayoutGroup[];
  existingTemplateIds: Set<string>;
  onCreateTemplate: (template: CustomTemplate) => void;
  onCancel: () => void;
}

export default function CreateTemplateForm({
  layoutGroups,
  existingTemplateIds,
  onCreateTemplate,
  onCancel,
}: CreateTemplateFormProps) {
  const defaultSectionId = layoutGroups[0]?.id ?? "custom_presets";

  const [sectionChoice, setSectionChoice] = useState<string>(defaultSectionId);
  const [newSectionName, setNewSectionName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [unit, setUnit] = useState<"in" | "px">("in");
  const [widthDraft, setWidthDraft] = useState("");
  const [heightDraft, setHeightDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isCreatingNewSection = sectionChoice === NEW_SECTION_VALUE;

  function handleSubmit() {
    setErrorMessage("");

    const trimmedName = templateName.trim();
    if (!trimmedName) {
      setErrorMessage("Enter a template name.");
      return;
    }

    let categoryId = sectionChoice;
    let categoryName = "";

    if (isCreatingNewSection) {
      const trimmedSection = newSectionName.trim();
      if (!trimmedSection) {
        setErrorMessage("Enter a name for the new section.");
        return;
      }

      const existingByName = layoutGroups.find(
        (group) => group.name.trim().toLowerCase() === trimmedSection.toLowerCase(),
      );
      if (existingByName) {
        categoryId = existingByName.id;
        categoryName = existingByName.name;
      } else {
        const baseCatSlug = slugifyTemplateSegment(trimmedSection, "section");
        let candidateCatId = baseCatSlug;
        let catSuffix = 2;
        const existingCatIds = new Set(layoutGroups.map((g) => g.id));
        while (existingCatIds.has(candidateCatId)) {
          candidateCatId = `${baseCatSlug}_${catSuffix}`;
          catSuffix += 1;
        }
        categoryId = candidateCatId;
        categoryName = trimmedSection;
      }
    } else {
      const matchedGroup = layoutGroups.find((g) => g.id === sectionChoice);
      if (!matchedGroup) {
        setErrorMessage("Select a valid section.");
        return;
      }
      categoryId = matchedGroup.id;
      categoryName = matchedGroup.name;
    }

    const parsedWidth = Number(widthDraft.trim());
    const parsedHeight = Number(heightDraft.trim());
    if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
      setErrorMessage("Enter a valid width greater than 0.");
      return;
    }
    if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
      setErrorMessage("Enter a valid height greater than 0.");
      return;
    }

    const normalizedWidth =
      unit === "px"
        ? Math.max(1, Math.round(parsedWidth))
        : Number(parsedWidth.toFixed(2));
    const normalizedHeight =
      unit === "px"
        ? Math.max(1, Math.round(parsedHeight))
        : Number(parsedHeight.toFixed(2));

    const widthCm =
      unit === "px"
        ? Number(((normalizedWidth / OUTPUT_DPI) * CM_PER_INCH).toFixed(4))
        : Number((normalizedWidth * CM_PER_INCH).toFixed(4));
    const heightCm =
      unit === "px"
        ? Number(((normalizedHeight / OUTPUT_DPI) * CM_PER_INCH).toFixed(4))
        : Number((normalizedHeight * CM_PER_INCH).toFixed(4));

    const baseId = `${slugifyTemplateSegment(categoryId, "custom")}_${slugifyTemplateSegment(trimmedName, "template")}`;
    let templateId = baseId;
    let suffix = 2;
    while (existingTemplateIds.has(templateId)) {
      templateId = `${baseId}_${suffix}`;
      suffix += 1;
    }

    const description =
      unit === "px"
        ? `${normalizedWidth} x ${normalizedHeight} px custom template.`
        : `${normalizedWidth} x ${normalizedHeight} inch custom template at 300 DPI.`;

    const newTemplate: CustomTemplate = {
      id: templateId,
      name: trimmedName,
      description,
      width: normalizedWidth,
      height: normalizedHeight,
      unit,
      widthCm,
      heightCm,
      categoryId,
      categoryName,
    };

    onCreateTemplate(newTemplate);
  }

  return (
    <div className="create-template-section">
      <div className="template-picker-header">
        <div className="layout-summary-copy">
          <p className="section-summary-label">CREATE NEW TEMPLATE</p>
        </div>
        <button
          type="button"
          className="theme-edit-done-btn"
          onClick={onCancel}
        >
          Back
        </button>
      </div>

      <div className="create-template-form">
        <label>
          Section
          <select
            className="form-control-tall"
            value={sectionChoice}
            onChange={(event) => {
              setSectionChoice(event.target.value);
              setErrorMessage("");
            }}
          >
            {layoutGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            <option value={NEW_SECTION_VALUE}>+ Create new section…</option>
          </select>
        </label>

        {isCreatingNewSection ? (
          <label>
            New section name
            <input
              type="text"
              className="form-control-tall"
              value={newSectionName}
              onChange={(event) => {
                setNewSectionName(event.target.value);
                setErrorMessage("");
              }}
              maxLength={40}
              placeholder="e.g. Coasters, Tote Bags"
              autoFocus
            />
          </label>
        ) : null}

        <label>
          Template name
          <input
            type="text"
            className="form-control-tall"
            value={templateName}
            onChange={(event) => {
              setTemplateName(event.target.value);
              setErrorMessage("");
            }}
            maxLength={60}
            placeholder="e.g. 12x18 Print"
          />
        </label>

        <div className="layout-unit-switcher-row">
          <span className="layout-unit-switcher-label">Units</span>
          <div
            className="layout-unit-switcher"
            role="group"
            aria-label="Template size units"
          >
            <button
              type="button"
              className={`layout-unit-btn${unit === "in" ? " is-active" : ""}`}
              aria-pressed={unit === "in"}
              onClick={() => {
                setUnit("in");
                setErrorMessage("");
              }}
            >
              Inches (in)
            </button>
            <button
              type="button"
              className={`layout-unit-btn${unit === "px" ? " is-active" : ""}`}
              aria-pressed={unit === "px"}
              onClick={() => {
                setUnit("px");
                setErrorMessage("");
              }}
            >
              Pixels (px)
            </button>
          </div>
        </div>

        <div className="field-grid keep-two-mobile">
          <label>
            Width ({unit})
            <input
              type="number"
              className="form-control-tall"
              min={0}
              step={unit === "px" ? 1 : "any"}
              value={widthDraft}
              onChange={(event) => {
                setWidthDraft(event.target.value);
                setErrorMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={unit === "px" ? "e.g. 1920" : "e.g. 12"}
            />
          </label>
          <label>
            Height ({unit})
            <input
              type="number"
              className="form-control-tall"
              min={0}
              step={unit === "px" ? 1 : "any"}
              value={heightDraft}
              onChange={(event) => {
                setHeightDraft(event.target.value);
                setErrorMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={unit === "px" ? "e.g. 1080" : "e.g. 18"}
            />
          </label>
        </div>

        {errorMessage ? (
          <p className="create-template-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="button"
          className="create-template-submit-btn"
          onClick={handleSubmit}
        >
          <AddIcon aria-hidden="true" />
          <span>Save Template</span>
        </button>
      </div>
    </div>
  );
}
