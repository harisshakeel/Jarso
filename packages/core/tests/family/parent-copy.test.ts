import {
  addChildCopy,
  familySettingsCopy,
  invitationGone,
  inviteCopy,
  nicknameTaken,
  setupCopy,
} from "@jarso/core/family";
import { describe, expect, it } from "vitest";

// Parent family copy, moved word for word from the web components.

describe("parent family copy", () => {
  it("keeps every line", () => {
    expect({
      nicknameTaken,
      invitationGone,
      setupCopy,
      addChildCopy,
      inviteCopy,
      familySettingsCopy,
    }).toMatchSnapshot();
  });

  it("fills in the child's nickname as the web did", () => {
    expect(nicknameTaken).toBe("Another child in your family already uses this nickname");
    expect(addChildCopy.added("Ada")).toBe("Ada is in your family");
    expect(inviteCopy.added("Ada")).toBe("Ada is in your family");
    expect(familySettingsCopy.removeBody("Ada")).toBe(
      "Ada will be signed out on every device and their PIN will stop working. Their account is deleted. You can add Ada again later with a new PIN. This can't be undone.",
    );
    expect(familySettingsCopy.pinBody("Ada")).toBe(
      "The old PIN stops working straight away. Tell Ada the new one.",
    );
    expect(familySettingsCopy.childSignsIn("6D42DK")).toBe(
      "Signs in with family code 6D42DK, nickname and PIN",
    );
    expect(familySettingsCopy.nicknameIs("Ada")).toBe("Nickname: Ada");
    expect(familySettingsCopy.removeFromFamily("Ada")).toBe("Remove Ada from your family");
    expect(familySettingsCopy.familyBody("Pound sterling (£)")).toBe(
      "Money is kept in Pound sterling (£). That can't change once the family exists.",
    );
  });
});
