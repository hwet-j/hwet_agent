package expo.modules.assistantbridge

import android.net.Uri
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 내 앱(LeaseLog, 캘린더)이 ContentProvider 로 내놓는 읽기 전용 스냅샷을 앱을 열지 않고 가져온다.
 * 허용 목록에 있는 제공자만 호출한다. 상대 앱은 호출자 패키지(com.hwetj.assistant)를 확인해 응답한다.
 */
class AssistantBridgeModule : Module() {
  private val allowed = setOf("com.rentmanager.app.assistant", "com.hwetj.calendar.assistant", "com.hwetj.flowledger.assistant", "com.hwetj.routinelog.assistant")

  override fun definition() = ModuleDefinition {
    Name("AssistantBridge")

    AsyncFunction("snapshot") { authority: String ->
      if (authority !in allowed) {
        return@AsyncFunction mapOf<String, Any?>("error" to "not_allowed")
      }
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      try {
        val bundle = context.contentResolver.call(Uri.parse("content://$authority"), "snapshot", null, null)
        if (bundle == null) {
          mapOf<String, Any?>("error" to "unavailable")
        } else {
          mapOf<String, Any?>(
            "json" to bundle.getString("json"),
            "ts" to bundle.getLong("ts", 0L).toDouble(),
            "error" to bundle.getString("error"),
          )
        }
      } catch (e: Exception) {
        // 앱이 없거나 제공자가 없는 구버전이면 여기로 온다
        mapOf<String, Any?>("error" to "unavailable")
      }
    }

    // 일반 호출: FlowLedger 처럼 읽기/쓰기 메서드(query, add, update, delete …)를 가진 제공자용
    AsyncFunction("call") { authority: String, method: String, arg: String? ->
      if (authority !in allowed) {
        return@AsyncFunction mapOf<String, Any?>("error" to "not_allowed")
      }
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      try {
        val bundle = context.contentResolver.call(Uri.parse("content://$authority"), method, arg, null)
        if (bundle == null) {
          mapOf<String, Any?>("error" to "unavailable")
        } else {
          mapOf<String, Any?>(
            "json" to bundle.getString("json"),
            "ts" to bundle.getLong("ts", 0L).toDouble(),
            "error" to bundle.getString("error"),
            "message" to bundle.getString("message"),
          )
        }
      } catch (e: Exception) {
        mapOf<String, Any?>("error" to "unavailable")
      }
    }
  }
}
