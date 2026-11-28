# 旅の継続記録：段階的な実装

更新：2026-11-28。ユーザー端末はROG Phone 8 Pro、ウォッチはGalaxy Watch6。

## 方針

1. GPX取り込みを既存PWAへ追加する。日時付きの実測点を温泉・城・名勝と照合し、既存の一括記録画面へ候補を渡す。
2. Android側での位置情報フォアグラウンドサービスを小さく試作し、画面OFF、徒歩・鉄道、圏外、省電力設定、再起動、強制停止を検証する。
3. Galaxy Watch6からSamsung Healthへ同期された運動データを調査し、Health ConnectまたはSamsung Health Data SDK経由でGPS経路を取得できるか実機で確認する。

後から追加する連携方式も、日時・緯度経度・取得元・精度の有無を残す共通の候補へ正規化する。

## GPXの今回の範囲

- `trkseg/trkpt`の実測位置と時差情報付き日時のみを使用。予定の`rtept`や日時なしデータは訪問候補にしない。
- 記録点間を結んで、未記録地点を訪れたと推測しない。
- 同一地点・UTC日ごとに最も近い実測点を候補として残す。同じ候補IDの再取込は重複させず、未確定で証拠が改善したものだけ更新する。
- 外部ファイルは精度・真正性を保証できないため、範囲内でも通常の訪問記録として扱う。現地GPS専用実績や武将確定加入に昇格させない。
- ファイルは端末内で処理。経路全体やファイル本体は保存せず、候補となった点と日時、取得元を保存する。
- 取込時にユーザーが変わったら保存前に中止。一括保存に失敗した場合は既存候補を保持する。
- 10MB・5万点まで。大量ログは分割して使用。時間差なしの点、壊れたXML、外部エンティティ宣言は拒否する。

## Galaxy Watch6の検証

確認済みの一般仕様と、実機で未確認の点を分ける。

Samsung公式FAQでは、Galaxy Watchの健康データはスマホのSamsung Healthへ転送され、そこからHealth Connectへ同期する。Wear OSからHealth Connectを直接読む構成ではない。同期タイミングはWatchとSamsung Health側の方針に依存する。

Samsung公式サポートには、運動の自動検出と位置記録を設定する手順がある。ただし機種・バージョンごとに異なると明記されており、Watch6で自動検出が全区間の精密なGPS経路を残すことや、鉄道区間まで記録することは未確認。

Samsung Health Data SDKにはExerciseLocationの読取がある。Health Connect経由で運動セッションが読めても、同じセッションのGPS経路まで共有されるとは判断しない。以下を分けて調べる。

- Watch6で手動開始した屋外ウォーキングに地図・時刻付き経路があるか。
- 自動検出したウォーキングにも同じ経路があるか。
- スマホのSamsung HealthにGPX書出しが表示されるか。時計へのルート案内用GPX取込とは区別する。
- Health Connectへ経路本体が渡るか。読取権限とデータ有無を別に検査する。
- 渡らない場合、Samsung Health Data SDK経由で読み取れるか。配布条件や権限も公式仕様を確認する。
- 同一散策をGPX・写真・将来のHealth連携から重複取得した場合の整理を確認する。

## 参照した公式資料

- https://developer.samsung.com/health/health-connect-faq.html
- https://www.samsung.com/us/support/answer/ANS10003476/
- https://developer.samsung.com/health/data/api-reference/-shd/com.samsung.android.sdk.health.data.data.entries/-exercise-location/index.html
- https://developer.samsung.com/health/data/api-reference/-shd/com.samsung.android.sdk.health.data.request/-data-type/-exercise-location-type/index.html
- https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes
- https://developer.android.com/develop/sensors-and-location/location/permissions
