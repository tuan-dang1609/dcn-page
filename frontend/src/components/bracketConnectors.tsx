import {

  BRACKET_CONN_ACTIVE_STROKE,

  BRACKET_CONN_BASE_STROKE,

  BRACKET_CONN_DIM_OPACITY,

} from "@/components/bracketHover";



export const getSegmentRange = (

  prevCount: number,

  currCount: number,

  currIndex: number,

) => {

  const start = Math.floor((currIndex * prevCount) / currCount);

  const end = Math.max(

    start,

    Math.floor(((currIndex + 1) * prevCount) / currCount) - 1,

  );

  return { start, end };

};



export const getCardCenterY = (top: number, cardH: number) => top + cardH / 2;



export const buildBracketColumnLayout = <T,>({

  columns,

  cardH,

  roundGap,

  cardW,

  connW,

  headerH,

}: {

  columns: T[][];

  cardH: number;

  roundGap: number;

  cardW: number;

  connW: number;

  headerH: number;

}) => {

  if (!columns.length) return null;



  const tops: number[][] = [];

  tops.push(columns[0].map((_, index) => index * (cardH + roundGap)));



  for (let col = 1; col < columns.length; col += 1) {

    const prevTops = tops[col - 1];

    const prevCount = prevTops.length;

    const currCount = columns[col].length;

    const currentTops: number[] = [];



    for (let i = 0; i < currCount; i += 1) {

      const { start, end } = getSegmentRange(prevCount, currCount, i);

      const segmentCenters = prevTops

        .slice(start, end + 1)

        .map((top) => getCardCenterY(top, cardH));

      const avgCenter =

        segmentCenters.reduce((sum, value) => sum + value, 0) /

        segmentCenters.length;

      currentTops.push(avgCenter - cardH / 2);

    }



    tops.push(currentTops);

  }



  const minTop = Math.min(...tops.flat());

  if (minTop < 0) {

    for (let c = 0; c < tops.length; c += 1) {

      tops[c] = tops[c].map((top) => top - minTop);

    }

  }



  const maxBottom = Math.max(

    ...tops.flatMap((columnTops) => columnTops.map((top) => top + cardH)),

  );



  return {

    columns,

    tops,

    totalW: columns.length * cardW + (columns.length - 1) * connW,

    totalH: maxBottom + headerH,

  };

};



export const RoundConnector = ({

  connW,

  headerH,

  inYs,

  outY,

  hasHover,

  activeInputIndexes,

  activeOutput,

}: {

  connW: number;

  headerH: number;

  inYs: number[];

  outY: number;

  hasHover: boolean;

  activeInputIndexes: number[];

  activeOutput: boolean;

}) => {

  if (!inYs.length) return null;



  const allYs = [...inYs, outY];

  const top = Math.min(...allYs);

  const bottom = Math.max(...allYs);

  const svgTop = top;

  const svgHeight = bottom - top + 2;

  const midX = connW / 2;

  const baseStroke = BRACKET_CONN_BASE_STROKE;

  const hiStroke = BRACKET_CONN_ACTIVE_STROKE;

  const baseOpacity = hasHover ? BRACKET_CONN_DIM_OPACITY : 1;



  const normalizedInYs = inYs.map((y) => y - svgTop + 1);

  const normalizedOutY = outY - svgTop + 1;

  const trunkMin = Math.min(...normalizedInYs, normalizedOutY);

  const trunkMax = Math.max(...normalizedInYs, normalizedOutY);



  const activeYs = activeInputIndexes

    .filter((index) => index >= 0 && index < normalizedInYs.length)

    .map((index) => normalizedInYs[index]);



  return (

    <svg

      width={connW}

      height={svgHeight}

      className="pointer-events-none absolute"

      style={{ top: svgTop + headerH, left: 0 }}

    >

      {normalizedInYs.map((y, index) => (

        <line

          key={`base-in-${index}`}

          x1={0}

          y1={y}

          x2={midX}

          y2={y}

          stroke={baseStroke}

          strokeWidth={2}

          opacity={baseOpacity}

        />

      ))}



      <line

        x1={midX}

        y1={trunkMin}

        x2={midX}

        y2={trunkMax}

        stroke={baseStroke}

        strokeWidth={2}

        opacity={baseOpacity}

      />



      <line

        x1={midX}

        y1={normalizedOutY}

        x2={connW}

        y2={normalizedOutY}

        stroke={baseStroke}

        strokeWidth={2}

        opacity={baseOpacity}

      />



      {activeYs.length ? (

        <>

          {activeYs.map((y, idx) => (

            <line

              key={`active-in-${idx}`}

              x1={0}

              y1={y}

              x2={midX}

              y2={y}

              stroke={hiStroke}

              strokeWidth={3}

            />

          ))}

          {activeOutput ? (

            <>

              <line

                x1={midX}

                y1={Math.min(normalizedOutY, ...activeYs)}

                x2={midX}

                y2={Math.max(normalizedOutY, ...activeYs)}

                stroke={hiStroke}

                strokeWidth={3}

              />

              <line

                x1={midX}

                y1={normalizedOutY}

                x2={connW}

                y2={normalizedOutY}

                stroke={hiStroke}

                strokeWidth={3}

              />

            </>

          ) : null}

        </>

      ) : null}

    </svg>

  );

};



/** Connector spanning a horizontal gap between bracket columns (Swiss stages). */

export const GapBracketConnector = ({

  x1,

  x2,

  inYs,

  outY,

  hasHover,

  activeInputIndexes,

  activeOutput,

}: {

  x1: number;

  x2: number;

  inYs: number[];

  outY: number;

  hasHover: boolean;

  activeInputIndexes: number[];

  activeOutput: boolean;

}) => {

  if (!inYs.length) return null;



  const width = x2 - x1;

  const allYs = [...inYs, outY];

  const top = Math.min(...allYs);

  const bottom = Math.max(...allYs);

  const svgHeight = bottom - top + 2;

  const joinX = Math.floor(width * 0.35);

  const baseStroke = BRACKET_CONN_BASE_STROKE;

  const hiStroke = BRACKET_CONN_ACTIVE_STROKE;

  const baseOpacity = hasHover ? BRACKET_CONN_DIM_OPACITY : 1;



  const normalizedInYs = inYs.map((y) => y - top + 1);

  const normalizedOutY = outY - top + 1;

  const trunkMin = Math.min(...normalizedInYs, normalizedOutY);

  const trunkMax = Math.max(...normalizedInYs, normalizedOutY);



  const activeYs = activeInputIndexes

    .filter((index) => index >= 0 && index < normalizedInYs.length)

    .map((index) => normalizedInYs[index]);



  return (

    <svg

      width={width}

      height={svgHeight}

      className="pointer-events-none absolute"

      style={{ left: x1, top }}

    >

      {normalizedInYs.map((y, index) => (

        <line

          key={`gap-in-${index}`}

          x1={0}

          y1={y}

          x2={joinX}

          y2={y}

          stroke={baseStroke}

          strokeWidth={2}

          opacity={baseOpacity}

        />

      ))}



      <line

        x1={joinX}

        y1={trunkMin}

        x2={joinX}

        y2={trunkMax}

        stroke={baseStroke}

        strokeWidth={2}

        opacity={baseOpacity}

      />



      <line

        x1={joinX}

        y1={normalizedOutY}

        x2={width}

        y2={normalizedOutY}

        stroke={baseStroke}

        strokeWidth={2}

        opacity={baseOpacity}

      />



      {activeYs.length ? (

        <>

          {activeYs.map((y, idx) => (

            <line

              key={`gap-active-in-${idx}`}

              x1={0}

              y1={y}

              x2={joinX}

              y2={y}

              stroke={hiStroke}

              strokeWidth={3}

            />

          ))}

          {activeOutput ? (

            <>

              <line

                x1={joinX}

                y1={Math.min(normalizedOutY, ...activeYs)}

                x2={joinX}

                y2={Math.max(normalizedOutY, ...activeYs)}

                stroke={hiStroke}

                strokeWidth={3}

              />

              <line

                x1={joinX}

                y1={normalizedOutY}

                x2={width}

                y2={normalizedOutY}

                stroke={hiStroke}

                strokeWidth={3}

              />

            </>

          ) : null}

        </>

      ) : null}

    </svg>

  );

};


