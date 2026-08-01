import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { OpinionPicker } from "@/components/mark/opinion-picker";

describe("OpinionPicker form serialization", () => {
  it("submits selected good-at tags exactly once under the server field name", async () => {
    const user = userEvent.setup();
    const { container } = render(<form><OpinionPicker namePrefix="opinion_tags" /></form>);

    await user.click(screen.getByRole("checkbox", { name: /聊得开/ }));

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(new FormData(form!).getAll("opinion_tags")).toEqual(["good_for_chat"]);
    expect(new FormData(form!).getAll("opinion_tags__ui")).toEqual(["good_for_chat"]);
  });
});
