"use client";

import { tourCopy } from "@jarso/core/tour";
import { MapIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { startTour } from "./tour-store";

/** Me: "Show me around again" starts the welcome tour from the first step, on Home. */
export function ReplayTourButton() {
  return (
    <Button type="button" variant="secondary" onClick={startTour}>
      <MapIcon aria-hidden />
      {tourCopy.replay}
    </Button>
  );
}
