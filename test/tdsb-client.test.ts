import { describe, expect, it } from "vitest";
import { parseCataloguePictureFilenames, parseSpaceDetails, parseTotalSquareFootage } from "../lib/tdsb-client";

const wrap = (jsArray: string) => `
  <html><body>
    <script type="text/javascript">
    window.addEvent('domready', function() {
      var fileNames = ${jsArray};
      var current = 0;
    });
    </script>
  </body></html>
`;

describe("parseCataloguePictureFilenames", () => {
  it("extracts a single filename", () => {
    expect(parseCataloguePictureFilenames(wrap(`["10618.jpeg"]`))).toEqual(["10618.jpeg"]);
  });

  it("extracts multiple filenames", () => {
    expect(parseCataloguePictureFilenames(wrap(`["10614.jpeg","10615.jpeg"]`))).toEqual(["10614.jpeg", "10615.jpeg"]);
  });

  it("returns an empty array when the gallery has no images", () => {
    expect(parseCataloguePictureFilenames(wrap(`[]`))).toEqual([]);
  });

  it("returns an empty array when the fileNames declaration is missing", () => {
    expect(parseCataloguePictureFilenames("<html><body><p>no gallery here</p></body></html>")).toEqual([]);
  });

  it("rejects non-image filenames", () => {
    expect(parseCataloguePictureFilenames(wrap(`["../../etc/passwd","ok.jpeg"]`))).toEqual(["ok.jpeg"]);
  });
});

describe("parseSpaceDetails", () => {
  it("extracts attributes, pictures, and square footage", () => {
    const html = `
      <fieldset>
        <legend>Attributes</legend>
        <table class="list">
          <tbody>
            <tr><td>Total Square Footage</td><td>633.78 sqm/6822 sqft</td></tr>
            <tr><td>Floor Type</td><td>Hardwood&nbsp;</td></tr>
          </tbody>
        </table>
      </fieldset>
      <script>var fileNames = ["1087.jpeg","1088.jpeg"];</script>
    `;

    expect(parseSpaceDetails(html)).toEqual({
      pictureFilenames: ["1087.jpeg", "1088.jpeg"],
      attributes: {
        "Total Square Footage": "633.78 sqm/6822 sqft",
        "Floor Type": "Hardwood",
      },
      areaSqm: 633.78,
      areaSqft: 6822,
    });
  });

  it("returns empty attributes and null areas when the attributes table is missing", () => {
    expect(parseSpaceDetails("<html><body></body></html>")).toEqual({
      pictureFilenames: [],
      attributes: {},
      areaSqm: null,
      areaSqft: null,
    });
  });
});

describe("parseTotalSquareFootage", () => {
  it("parses comma-separated values", () => {
    expect(parseTotalSquareFootage("1,234.5 sqm/13,288 sqft")).toEqual({ areaSqm: 1234.5, areaSqft: 13288 });
  });

  it("returns null values when no units are present", () => {
    expect(parseTotalSquareFootage("unknown")).toEqual({ areaSqm: null, areaSqft: null });
  });
});
